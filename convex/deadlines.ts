import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";
import { notify } from "./lib/notify";
import { assertRelated, relatedLabels, type RelatedIds } from "./lib/related";
import { formatDateIt } from "./lib/reminders";
import { assertTimestamp, cleanText } from "./lib/text";

/**
 * Scadenziario: un'unica vista di tutto cio' che scade (fatture, rinnovi, firme richieste) piu' le scadenze
 * inserite a mano (dominio, hosting, contratto...). Solo amministratori.
 */

const DAY = 24 * 60 * 60 * 1000;
const HORIZON_DAYS = 180;
const MANUAL_REMINDER_DAYS = 7;

const category = v.union(v.literal("domain"), v.literal("hosting"), v.literal("contract"), v.literal("other"));

export type DeadlineKind = "invoice" | "subscription" | "signature" | "approval" | "manual";
export type DeadlineItem = {
  key: string;
  kind: DeadlineKind;
  title: string;
  clientId: Id<"clients"> | null;
  clientName: string | null;
  at: number;
  amountCents: number | null;
  /** Solo per le scadenze manuali. */
  manualId: Id<"deadlines"> | null;
  category: "domain" | "hosting" | "contract" | "other" | null;
  notes: string | null;
  /** A cosa e' collegata (solo scadenze manuali). */
  related: string[];
};

/** `nowMs` arriva dal browser (arrotondato all'ora): le query non leggono l'orologio. */
export const overview = query({
  args: { nowMs: v.number() },
  handler: async (ctx, args): Promise<DeadlineItem[]> => {
    await requireAdmin(ctx);
    const limit = args.nowMs + HORIZON_DAYS * DAY;
    const items: DeadlineItem[] = [];
    const names = new Map<string, string>();
    const nameOf = async (id: Id<"clients"> | undefined) => {
      if (!id) return null;
      if (!names.has(id)) names.set(id, (await ctx.db.get("clients", id))?.displayName ?? "Cliente eliminato");
      return names.get(id) ?? null;
    };

    for (const status of ["sent", "overdue"] as const) {
      const rows = await ctx.db.query("invoices").withIndex("by_status_and_dueAt", (q) => q.eq("status", status).lt("dueAt", limit)).take(200);
      for (const i of rows) items.push({ key: `inv:${i._id}`, kind: "invoice", title: `Fattura ${i.number}`, clientId: i.clientId, clientName: await nameOf(i.clientId), at: i.dueAt, amountCents: i.amountCents, manualId: null, category: null, notes: null, related: [] });
    }
    const subs = await ctx.db.query("subscriptions").withIndex("by_status_and_nextRenewalAt", (q) => q.eq("status", "active").lt("nextRenewalAt", limit)).take(200);
    for (const s of subs) {
      if (s.nextRenewalAt === undefined) continue;
      items.push({ key: `sub:${s._id}`, kind: "subscription", title: `Rinnovo: ${s.name}`, clientId: s.clientId, clientName: await nameOf(s.clientId), at: s.nextRenewalAt, amountCents: s.amountCents, manualId: null, category: null, notes: null, related: [] });
    }
    const sigs = await ctx.db.query("signatureRequests").withIndex("by_status", (q) => q.eq("status", "pending")).take(200);
    for (const r of sigs) {
      if (r.expiresAt < args.nowMs || r.expiresAt > limit) continue;
      const doc = await ctx.db.get("documents", r.documentId);
      items.push({ key: `sig:${r._id}`, kind: "signature", title: `Firma in attesa: ${doc?.title ?? "documento"}`, clientId: r.clientId, clientName: await nameOf(r.clientId), at: r.expiresAt, amountCents: null, manualId: null, category: null, notes: null, related: [] });
    }
    const approvals = await ctx.db.query("approvalRequests").withIndex("by_status", (q) => q.eq("status", "pending")).take(200);
    for (const r of approvals) {
      if (r.expiresAt < args.nowMs || r.expiresAt > limit) continue;
      const doc = await ctx.db.get("documents", r.documentId);
      items.push({ key: `apr:${r._id}`, kind: "approval", title: `Approvazione in attesa: ${doc?.title ?? "documento"}`, clientId: r.clientId, clientName: await nameOf(r.clientId), at: r.expiresAt, amountCents: null, manualId: null, category: null, notes: null, related: [] });
    }
    const manual = await ctx.db.query("deadlines").withIndex("by_done_and_dueAt", (q) => q.eq("done", false).lt("dueAt", limit)).take(200);
    for (const d of manual) items.push({ key: `man:${d._id}`, kind: "manual", title: d.title, clientId: d.clientId ?? null, clientName: await nameOf(d.clientId), at: d.dueAt, amountCents: null, manualId: d._id, category: d.category, notes: d.notes ?? null, related: (await relatedLabels(ctx, { invoiceId: d.invoiceId, subscriptionId: d.subscriptionId, projectId: d.projectId })).map((r) => r.label) });

    return items.sort((a, b) => a.at - b.at);
  },
});

export const create = mutation({
  args: {
    title: v.string(), dueAt: v.number(), clientId: v.optional(v.id("clients")), category, notes: v.optional(v.string()),
    invoiceId: v.optional(v.id("invoices")), subscriptionId: v.optional(v.id("subscriptions")), projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args): Promise<Id<"deadlines">> => {
    const { actorId } = await requireAdmin(ctx);
    if (args.clientId && !(await ctx.db.get("clients", args.clientId))) return fail("NOT_FOUND", "Cliente non trovato.");
    const related: RelatedIds = { invoiceId: args.invoiceId, subscriptionId: args.subscriptionId, projectId: args.projectId };
    // Un collegamento richiede il cliente: se non e' indicato si ricava dal collegamento; se e' indicato deve coincidere.
    let clientId = args.clientId;
    if (related.invoiceId || related.subscriptionId || related.projectId) {
      const first = related.invoiceId ? await ctx.db.get("invoices", related.invoiceId) : related.subscriptionId ? await ctx.db.get("subscriptions", related.subscriptionId) : related.projectId ? await ctx.db.get("projects", related.projectId) : null;
      if (!first) return fail("NOT_FOUND", "Elemento collegato non trovato.");
      clientId = clientId ?? first.clientId;
      await assertRelated(ctx, clientId, related);
    }
    const id = await ctx.db.insert("deadlines", {
      title: cleanText(args.title, { field: "titolo", min: 2, max: 120 }),
      dueAt: assertTimestamp(args.dueAt, "scadenza"),
      clientId,
      category: args.category,
      notes: args.notes ? cleanText(args.notes, { field: "note", max: 1000, multiline: true }) : undefined,
      done: false,
      ...related,
    });
    await audit(ctx, { actorType: "admin", actorId, clientId, action: "deadline.created", resourceType: "deadline", resourceId: id });
    return id;
  },
});

export const setDone = mutation({
  args: { deadlineId: v.id("deadlines"), done: v.boolean() },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const d = await ctx.db.get("deadlines", args.deadlineId);
    if (!d) return fail("NOT_FOUND", "Scadenza non trovata.");
    await ctx.db.patch("deadlines", d._id, { done: args.done, doneAt: args.done ? Date.now() : undefined });
    await audit(ctx, { actorType: "admin", actorId, clientId: d.clientId, action: args.done ? "deadline.done" : "deadline.reopened", resourceType: "deadline", resourceId: d._id });
    return null;
  },
});

export const remove = mutation({
  args: { deadlineId: v.id("deadlines") },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const d = await ctx.db.get("deadlines", args.deadlineId);
    if (!d) return fail("NOT_FOUND", "Scadenza non trovata.");
    await ctx.db.delete("deadlines", d._id);
    await audit(ctx, { actorType: "admin", actorId, clientId: d.clientId, action: "deadline.deleted", resourceType: "deadline", resourceId: d._id });
    return null;
  },
});

/**
 * Promemoria INTERNO (ogni 6 ore): a noi, una volta sola, 7 giorni prima di una scadenza inserita a mano nello Scadenziario.
 * I promemoria ai clienti NON partono da qui: l'unico e' quello delle 10:30 del giorno prima (convex/paymentReminders.ts).
 */
export const sendReminders = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ deadlines: number }> => {
    const now = Date.now();
    let deadlines = 0;
    const soon = await ctx.db.query("deadlines").withIndex("by_done_and_dueAt", (q) => q.eq("done", false).lt("dueAt", now + MANUAL_REMINDER_DAYS * DAY)).take(100);
    for (const d of soon) {
      if (d.reminderSentAt !== undefined) continue;
      await ctx.db.patch("deadlines", d._id, { reminderSentAt: now });
      const client = d.clientId ? await ctx.db.get("clients", d.clientId) : null;
      await notify(ctx, "deadline_due", { clientId: d.clientId, data: { title: d.title, client: client?.displayName ?? "", date: formatDateIt(d.dueAt), notes: d.notes ?? "" }, ctaPath: "/admin/deadlines", dedupeSubject: d._id });
      deadlines++;
    }
    return { deadlines };
  },
});

/** Chiude le scadenze manuali collegate a un elemento che si e' concluso (pagamento incassato/annullato, abbonamento annullato). */
export async function closeLinkedDeadlines(ctx: MutationCtx, link: { invoiceId: Id<"invoices"> } | { subscriptionId: Id<"subscriptions"> }): Promise<number> {
  const rows =
    "invoiceId" in link
      ? await ctx.db.query("deadlines").withIndex("by_invoiceId", (q) => q.eq("invoiceId", link.invoiceId)).take(50)
      : await ctx.db.query("deadlines").withIndex("by_subscriptionId", (q) => q.eq("subscriptionId", link.subscriptionId)).take(50);
  let n = 0;
  for (const d of rows) {
    if (d.done) continue;
    await ctx.db.patch("deadlines", d._id, { done: true, doneAt: Date.now() });
    n++;
  }
  return n;
}
