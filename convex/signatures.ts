import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";
import { requireFreshUnlock, resolveLink, requireUnlock } from "./lib/links";
import { FRESH_CODE_MS, SIGN_TTL_MS, sha256Hex } from "./lib/signature";

/**
 * Firma elettronica semplice del cliente (vedi lib/signature.ts per cosa vale e cosa no).
 * Amministratore: chiede la firma di un PDF, la revoca, vede l'elenco. Cliente: vede solo le sue richieste e firma da `signActions.sign`.
 */

const STUCK_SIGNING_MS = 5 * 60 * 1000;
type PublicStatus = "pending" | "signed" | "revoked" | "expired";

const publicStatus = (r: { status: "pending" | "signing" | "signed" | "revoked"; expiresAt: number }, now: number): PublicStatus =>
  r.status === "signed" ? "signed" : r.status === "revoked" ? "revoked" : r.expiresAt <= now ? "expired" : "pending";

async function hashStored(ctx: { storage: { get: (id: Id<"_storage">) => Promise<Blob | null> } }, id: Id<"_storage">): Promise<string> {
  const blob = await ctx.storage.get(id);
  if (!blob) return fail("NOT_FOUND", "File non trovato.");
  return await sha256Hex(new Uint8Array(await blob.arrayBuffer()));
}

/** Crea la richiesta per un PDF del cliente (e lo rende visibile nel suo spazio). Condivisa tra pannello admin e invio dei documenti. */
async function createRequest(
  ctx: MutationCtx,
  documentId: Id<"documents">,
  actorId: string,
  draftId?: Id<"docDrafts">,
): Promise<Id<"signatureRequests">> {
  const doc = await ctx.db.get("documents", documentId);
  if (!doc) return fail("NOT_FOUND", "Documento non trovato.");
  if (doc.mimeType !== "application/pdf") return fail("BAD_STATE", "Si può chiedere la firma solo di un PDF.");
  if (doc.scanStatus !== "clean") return fail("BAD_STATE", "Il file non ha superato i controlli di sicurezza.");
  const client = await ctx.db.get("clients", doc.clientId);
  if (!client) return fail("NOT_FOUND", "Cliente non trovato.");
  const now = Date.now();
  const existing = await ctx.db
    .query("signatureRequests")
    .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
    .take(20);
  if (existing.some((r) => (r.status === "pending" || r.status === "signing") && r.expiresAt > now)) return fail("CONFLICT", "Per questo documento c'è già una richiesta di firma in corso.");
  if (existing.some((r) => r.status === "signed")) return fail("BAD_STATE", "Questo documento è già stato firmato.");
  const docSha256 = await hashStored(ctx, doc.storageId);
  if (!doc.visibleToClient) await ctx.db.patch("documents", doc._id, { visibleToClient: true });
  const id = await ctx.db.insert("signatureRequests", {
    clientId: doc.clientId,
    documentId,
    draftId,
    status: "pending",
    signerEmail: client.email,
    createdAt: now,
    expiresAt: now + SIGN_TTL_MS,
    docSha256,
  });
  await audit(ctx, { actorType: "admin", actorId, clientId: doc.clientId, action: "signature.requested", resourceType: "signatureRequest", resourceId: id });
  await ctx.scheduler.runAfter(0, internal.signActions.notifyRequested, { requestId: id });
  return id;
}

export const requestForDocument = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args): Promise<Id<"signatureRequests">> => {
    const { actorId } = await requireAdmin(ctx);
    return await createRequest(ctx, args.documentId, actorId);
  },
});

/** Dopo l'invio di una bozza: si chiede la firma del PDF appena archiviato. */
export const requestFromSend = internalMutation({
  args: { documentId: v.id("documents"), draftId: v.id("docDrafts"), actorId: v.string() },
  handler: async (ctx, args): Promise<Id<"signatureRequests">> => await createRequest(ctx, args.documentId, args.actorId, args.draftId),
});

export const revoke = mutation({
  args: { requestId: v.id("signatureRequests") },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const r = await ctx.db.get("signatureRequests", args.requestId);
    if (!r) return fail("NOT_FOUND", "Richiesta non trovata.");
    if (r.status === "signed") return fail("BAD_STATE", "Il documento è già stato firmato.");
    await ctx.db.patch("signatureRequests", r._id, { status: "revoked" });
    await audit(ctx, { actorType: "admin", actorId, clientId: r.clientId, action: "signature.revoked", resourceType: "signatureRequest", resourceId: r._id });
    return null;
  },
});

/** Elenco per l'amministratore: stato, documento e cliente. */
export const list = query({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const clientId = args.clientId;
    const rows =
      clientId === undefined
        ? await ctx.db.query("signatureRequests").order("desc").take(200)
        : await ctx.db
            .query("signatureRequests")
            .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
            .order("desc")
            .take(200);
    const now = Date.now();
    const out = [];
    for (const r of rows) {
      const [doc, client] = await Promise.all([ctx.db.get("documents", r.documentId), ctx.db.get("clients", r.clientId)]);
      out.push({
        id: r._id,
        clientId: r.clientId,
        clientName: client?.displayName ?? "—",
        documentId: r.documentId,
        title: doc?.title ?? "Documento eliminato",
        status: publicStatus(r, now),
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        signedAt: r.signedAt ?? null,
        signedName: r.signedName ?? null,
        signedDocumentId: r.signedDocumentId ?? null,
        ip: r.ip ?? null,
      });
    }
    return out;
  },
});

/** Richieste del cliente collegato (dietro il codice di sblocco): servono a mostrare «Da firmare» accanto ai documenti. */
export const forClient = query({
  args: { token: v.string(), unlockToken: v.string() },
  handler: async (ctx, args) => {
    const link = await resolveLink(ctx, args.token);
    await requireUnlock(ctx, link, args.unlockToken);
    const rows = await ctx.db
      .query("signatureRequests")
      .withIndex("by_clientId", (q) => q.eq("clientId", link.clientId))
      .order("desc")
      .take(100);
    const now = Date.now();
    return rows
      .filter((r) => r.status !== "revoked")
      .map((r) => ({
        id: r._id,
        documentId: r.documentId,
        signedDocumentId: r.signedDocumentId ?? null,
        status: publicStatus(r, now),
        expiresAt: r.expiresAt,
        signedAt: r.signedAt ?? null,
        signedName: r.signedName ?? null,
      }));
  },
});

// ---- Passi interni della firma (chiamati solo da signActions.sign) ----

export const begin = internalMutation({
  args: { token: v.string(), unlockToken: v.string(), requestId: v.id("signatureRequests") },
  handler: async (ctx, args) => {
    const link = await resolveLink(ctx, args.token);
    const now = Date.now();
    const otpVerifiedAt = await requireFreshUnlock(ctx, link, args.unlockToken, FRESH_CODE_MS, now);
    const r = await ctx.db.get("signatureRequests", args.requestId);
    if (!r || r.clientId !== link.clientId) return fail("NOT_FOUND", "Richiesta di firma non trovata.");
    if (r.status === "signed") return fail("BAD_STATE", "Hai già firmato questo documento.");
    if (r.status === "revoked") return fail("BAD_STATE", "Questa richiesta di firma è stata annullata.");
    if (r.expiresAt <= now) return fail("BAD_STATE", "La richiesta di firma è scaduta: chiedi a CORE829 di inviarne una nuova.");
    if (r.status === "signing" && now - (r.signedAt ?? 0) < STUCK_SIGNING_MS) return fail("BAD_STATE", "La firma è già in corso.");
    const doc = await ctx.db.get("documents", r.documentId);
    if (!doc || doc.clientId !== link.clientId || doc.scanStatus !== "clean") return fail("NOT_FOUND", "Documento non trovato.");
    await ctx.db.patch("signatureRequests", r._id, { status: "signing", signedAt: now });
    return { storageId: doc.storageId, title: doc.title, docSha256: r.docSha256, signerEmail: r.signerEmail, otpVerifiedAt: Math.floor(otpVerifiedAt), clientId: r.clientId, documentId: doc._id, kind: doc.kind, fileName: doc.fileName };
  },
});

export const release = internalMutation({
  args: { requestId: v.id("signatureRequests") },
  handler: async (ctx, args): Promise<null> => {
    const r = await ctx.db.get("signatureRequests", args.requestId);
    if (r && r.status === "signing") await ctx.db.patch("signatureRequests", r._id, { status: "pending", signedAt: undefined });
    return null;
  },
});

export const finish = internalMutation({
  args: {
    requestId: v.id("signatureRequests"),
    storageId: v.id("_storage"),
    sizeBytes: v.number(),
    signedSha256: v.string(),
    signedName: v.string(),
    ip: v.string(),
    userAgent: v.string(),
    otpVerifiedAt: v.number(),
    consentVersion: v.string(),
    title: v.string(),
    fileName: v.string(),
    kind: v.union(v.literal("contract"), v.literal("quote"), v.literal("invoice"), v.literal("deliverable"), v.literal("other")),
  },
  handler: async (ctx, args): Promise<{ signedDocumentId: Id<"documents">; clientId: Id<"clients"> }> => {
    const r = await ctx.db.get("signatureRequests", args.requestId);
    if (!r || r.status !== "signing") return fail("BAD_STATE", "La richiesta non è più in corso.");
    const signedDocumentId = await ctx.db.insert("documents", {
      clientId: r.clientId,
      kind: args.kind,
      title: `${args.title} — firmato`,
      storageId: args.storageId,
      fileName: args.fileName,
      mimeType: "application/pdf",
      sizeBytes: args.sizeBytes,
      scanStatus: "clean", // generato dal sistema
      sha256: args.signedSha256,
      visibleToClient: true,
    });
    const now = Date.now();
    await ctx.db.patch("signatureRequests", r._id, {
      status: "signed",
      signedAt: now,
      signedDocumentId,
      signedName: args.signedName,
      ip: args.ip,
      userAgent: args.userAgent,
      otpVerifiedAt: args.otpVerifiedAt,
      consentVersion: args.consentVersion,
      signedSha256: args.signedSha256,
    });
    await audit(ctx, { actorType: "client", clientId: r.clientId, action: "signature.signed", resourceType: "signatureRequest", resourceId: r._id, metadata: { consent: args.consentVersion } });
    return { signedDocumentId, clientId: r.clientId };
  },
});

/** Dati per le email (richiesta e conferma): niente segreti. */
export const emailData = internalMutation({
  args: { requestId: v.id("signatureRequests") },
  handler: async (ctx, args) => {
    const r = await ctx.db.get("signatureRequests", args.requestId);
    if (!r) return null;
    const [doc, signed, client] = await Promise.all([
      ctx.db.get("documents", r.documentId),
      r.signedDocumentId ? ctx.db.get("documents", r.signedDocumentId) : Promise.resolve(null),
      ctx.db.get("clients", r.clientId),
    ]);
    if (!doc || !client) return null;
    return { title: doc.title, clientName: client.displayName, email: r.signerEmail, expiresAt: r.expiresAt, signedStorageId: signed?.storageId ?? null, signedName: r.signedName ?? null };
  },
});
