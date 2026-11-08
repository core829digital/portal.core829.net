import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";
import { requireUnlock, resolveLink } from "./lib/links";
import { notify } from "./lib/notify";
import { formatDateIt } from "./lib/reminders";
import { cleanText, invalid } from "./lib/text";

/**
 * Approvazione di un documento (preventivo, bozza di lavoro...) da parte del cliente.
 * Il cliente APPROVA oppure CHIEDE MODIFICHE (con un commento): la decisione e' definitiva, per cambiarla
 * si invia una nuova richiesta. Non e' una firma: per quella c'e' il flusso di firma elettronica.
 */

export const APPROVAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type PublicStatus = "pending" | "approved" | "changes_requested" | "revoked" | "expired";
const publicStatus = (r: Doc<"approvalRequests">, now: number): PublicStatus => (r.status === "pending" && r.expiresAt <= now ? "expired" : r.status);

// ---------------------------------------------------------------- Amministratore

export const request = mutation({
  args: { documentId: v.id("documents"), message: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Id<"approvalRequests">> => {
    const { actorId } = await requireAdmin(ctx);
    const doc = await ctx.db.get("documents", args.documentId);
    if (!doc) return fail("NOT_FOUND", "Documento non trovato.");
    if (doc.scanStatus !== "clean") return fail("BAD_STATE", "Il file non ha superato i controlli di sicurezza.");
    const now = Date.now();
    const existing = await ctx.db.query("approvalRequests").withIndex("by_documentId", (q) => q.eq("documentId", doc._id)).take(20);
    if (existing.some((r) => r.status === "pending" && r.expiresAt > now)) return fail("CONFLICT", "Per questo documento c'è già una richiesta di approvazione in corso.");
    const message = args.message && args.message.trim() !== "" ? cleanText(args.message, { field: "messaggio", max: 500, multiline: true }) : undefined;
    // Il cliente deve poterlo vedere.
    if (!doc.visibleToClient) await ctx.db.patch("documents", doc._id, { visibleToClient: true });
    const id = await ctx.db.insert("approvalRequests", { clientId: doc.clientId, documentId: doc._id, message, status: "pending", createdAt: now, expiresAt: now + APPROVAL_TTL_MS });
    await audit(ctx, { actorType: "admin", actorId, clientId: doc.clientId, action: "approval.requested", resourceType: "approvalRequest", resourceId: id });
    await notify(ctx, "approval_requested", { clientId: doc.clientId, data: { title: doc.title, note: message ?? "", until: formatDateIt(now + APPROVAL_TTL_MS) }, dedupeSubject: id });
    return id;
  },
});

export const revoke = mutation({
  args: { requestId: v.id("approvalRequests") },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const r = await ctx.db.get("approvalRequests", args.requestId);
    if (!r) return fail("NOT_FOUND", "Richiesta non trovata.");
    if (r.status !== "pending") return fail("BAD_STATE", "Si possono annullare solo le richieste in attesa.");
    await ctx.db.patch("approvalRequests", r._id, { status: "revoked" });
    await audit(ctx, { actorType: "admin", actorId, clientId: r.clientId, action: "approval.revoked", resourceType: "approvalRequest", resourceId: r._id });
    return null;
  },
});

export const list = query({
  args: { clientId: v.optional(v.id("clients")), nowMs: v.number() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const clientId = args.clientId;
    const rows =
      clientId === undefined
        ? await ctx.db.query("approvalRequests").order("desc").take(200)
        : await ctx.db.query("approvalRequests").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).order("desc").take(200);
    const out = [];
    for (const r of rows) {
      const [doc, client] = await Promise.all([ctx.db.get("documents", r.documentId), ctx.db.get("clients", r.clientId)]);
      out.push({ id: r._id, clientId: r.clientId, clientName: client?.displayName ?? "—", documentId: r.documentId, title: doc?.title ?? "Documento eliminato", status: publicStatus(r, args.nowMs), createdAt: r.createdAt, expiresAt: r.expiresAt, decidedAt: r.decidedAt ?? null, decidedName: r.decidedName ?? null, comment: r.comment ?? null });
    }
    return out;
  },
});

// ---------------------------------------------------------------- Cliente

/** Richieste del cliente collegato (dietro lo sblocco). `nowMs` serve a riconoscere le scadute. */
export const forClient = query({
  args: { token: v.string(), unlockToken: v.string(), nowMs: v.number() },
  handler: async (ctx, args) => {
    const link = await resolveLink(ctx, args.token);
    await requireUnlock(ctx, link, args.unlockToken);
    const rows = await ctx.db.query("approvalRequests").withIndex("by_clientId", (q) => q.eq("clientId", link.clientId)).order("desc").take(100);
    return rows
      .filter((r) => r.status !== "revoked")
      .map((r) => ({ id: r._id, documentId: r.documentId, message: r.message ?? null, status: publicStatus(r, args.nowMs), expiresAt: r.expiresAt, decidedAt: r.decidedAt ?? null }));
  },
});

export const decide = mutation({
  args: { token: v.string(), unlockToken: v.string(), requestId: v.id("approvalRequests"), decision: v.union(v.literal("approve"), v.literal("changes")), fullName: v.string(), comment: v.optional(v.string()) },
  handler: async (ctx, args): Promise<null> => {
    const link = await resolveLink(ctx, args.token);
    await requireUnlock(ctx, link, args.unlockToken);
    const r = await ctx.db.get("approvalRequests", args.requestId);
    if (!r || r.clientId !== link.clientId) return fail("NOT_FOUND", "Richiesta non trovata.");
    const now = Date.now();
    if (r.status === "approved" || r.status === "changes_requested") return fail("BAD_STATE", "Hai già risposto a questa richiesta.");
    if (r.status === "revoked") return fail("BAD_STATE", "Questa richiesta è stata annullata.");
    if (r.expiresAt <= now) return fail("BAD_STATE", "La richiesta è scaduta: chiedi a CORE829 di inviarne una nuova.");
    const name = cleanText(args.fullName, { field: "nome", min: 3, max: 120 });
    const comment = args.comment && args.comment.trim() !== "" ? cleanText(args.comment, { field: "commento", max: 2000, multiline: true }) : undefined;
    if (args.decision === "changes" && !comment) return invalid("commento", "Scrivi quali modifiche ti servono.");
    const doc = await ctx.db.get("documents", r.documentId);
    const client = await ctx.db.get("clients", r.clientId);
    const approved = args.decision === "approve";
    await ctx.db.patch("approvalRequests", r._id, { status: approved ? "approved" : "changes_requested", decidedAt: now, decidedName: name, comment });
    await audit(ctx, { actorType: "client", clientId: r.clientId, action: approved ? "approval.approved" : "approval.changes_requested", resourceType: "approvalRequest", resourceId: r._id });
    await notify(ctx, approved ? "approval_approved" : "approval_changes", {
      clientId: r.clientId,
      data: { client: client?.displayName ?? "Cliente", title: doc?.title ?? "Documento", name, comment: comment ?? "" },
      ctaPath: "/admin/approvals",
      dedupeSubject: r._id,
    });
    return null;
  },
});
