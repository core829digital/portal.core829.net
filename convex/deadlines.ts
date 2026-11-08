import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";
import { notify } from "./lib/notify";
import { formatDateIt, formatEuroIt } from "./lib/reminders";
import { assertTimestamp, cleanText } from "./lib/text";

/**
 * Scadenziario: un'unica vista di tutto cio' che scade (fatture, rinnovi, firme richieste) piu' le scadenze
 * inserite a mano (dominio, hosting, contratto...). Solo amministratori.
 */

const DAY = 24 * 60 * 60 * 1000;
const HORIZON_DAYS = 180;
const INVOICE_REMINDER_DAYS = 3;
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
      for (const i of rows) items.push({ key: `inv:${i._id}`, kind: "invoice", title: `Fattura ${i.number}`, clientId: i.clientId, clientName: await nameOf(i.clientId), at: i.dueAt, amountCents: i.amountCents, manualId: null, category: null, notes: null });
    }
    const subs = await ctx.db.query("subscriptions").withIndex("by_status_and_nextRenewalAt", (q) => q.eq("status", "active").lt("nextRenewalAt", limit)).take(200);
    for (const s of subs) {
      if (s.nextRenewalAt === undefined) continue;
      items.push({ key: `sub:${s._id}`, kind: "subscription", title: `Rinnovo: ${s.name}`, clientId: s.clientId, clientName: await nameOf(s.clientId), at: s.nextRenewalAt, amountCents: s.amountCents, manualId: null, category: null, notes: null });
    }
    const sigs = await ctx.db.query("signatureRequests").withIndex("by_status", (q) => q.eq("status", "pending")).take(200);
    for (const r of sigs) {
      if (r.expiresAt < args.nowMs || r.expiresAt > limit) continue;
      const doc = await ctx.db.get("documents", r.documentId);
      items.push({ key: `sig:${r._id}`, kind: "signature", title: `Firma in attesa: ${doc?.title ?? "documento"}`, clientId: r.clientId, clientName: await nameOf(r.clientId), at: r.expiresAt, amountCents: null, manualId: null, category: null, notes: null });
    }
    const approvals = await ctx.db.query("approvalRequests").withIndex("by_status", (q) => q.eq("status", "pending")).take(200);
    for (const r of approvals) {
      if (r.expiresAt < args.nowMs || r.expiresAt > limit) continue;
      const doc = await ctx.db.get("documents", r.documentId);
      items.push({ key: `apr:${r._id}`, kind: "approval", title: `Approvazione in attesa: ${doc?.title ?? "documento"}`, clientId: r.clientId, clientName: await nameOf(r.clientId), at: r.expiresAt, amountCents: null, manualId: null, category: null, notes: null });
    }
    const manual = await ctx.db.query("deadlines").withIndex("by_done_and_dueAt", (q) => q.eq("done", false).lt("dueAt", limit)).take(200);
    for (const d of manual) items.push({ key: `man:${d._id}`, kind: "manual", title: d.title, clientId: d.clientId ?? null, clientName: await nameOf(d.clientId), at: d.dueAt, amountCents: null, manualId: d._id, category: d.category, notes: d.notes ?? null });

    return items.sort((a, b) => a.at - b.at);
  },
});

export const create = mutation({
  args: { title: v.string(), dueAt: v.number(), clientId: v.optional(v.id("clients")), category, notes: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Id<"deadlines">> => {
    const { actorId } = await requireAdmin(ctx);
    if (args.clientId && !(await ctx.db.get("clients", args.clientId))) return fail("NOT_FOUND", "Cliente non trovato.");
    const id = await ctx.db.insert("deadlines", {
      title: cleanText(args.title, { field: "titolo", min: 2, max: 120 }),
      dueAt: assertTimestamp(args.dueAt, "scadenza"),
      clientId: args.clientId,
      category: args.category,
      notes: args.notes ? cleanText(args.notes, { field: "note", max: 1000, multiline: true }) : undefined,
      done: false,
    });
    await audit(ctx, { actorType: "admin", actorId, clientId: args.clientId, action: "deadline.created", resourceType: "deadline", resourceId: id });
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
 * Promemoria automatici (ogni 6 ore):
 *  - al CLIENTE: fattura visibile e non pagata che scade entro 3 giorni (una sola volta);
 *  - a NOI: scadenza manuale non conclusa entro 7 giorni (una sola volta).
 */
export const sendReminders = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ invoices: number; deadlines: number }> => {
    const now = Date.now();
    let invoices = 0;
    const due = await ctx.db.query("invoices").withIndex("by_status_and_dueAt", (q) => q.eq("status", "sent").gt("dueAt", now).lt("dueAt", now + INVOICE_REMINDER_DAYS * DAY)).take(100);
    for (const i of due) {
      if (!i.visibleToClient || i.dueReminderSentAt !== undefined) continue;
      await ctx.db.patch("invoices", i._id, { dueReminderSentAt: now });
      await notify(ctx, "invoice_due_soon", { clientId: i.clientId, data: { number: i.number, amount: formatEuroIt(i.amountCents), due: formatDateIt(i.dueAt) }, dedupeSubject: i._id });
      invoices++;
    }
    let deadlines = 0;
    const soon = await ctx.db.query("deadlines").withIndex("by_done_and_dueAt", (q) => q.eq("done", false).lt("dueAt", now + MANUAL_REMINDER_DAYS * DAY)).take(100);
    for (const d of soon) {
      if (d.reminderSentAt !== undefined) continue;
      await ctx.db.patch("deadlines", d._id, { reminderSentAt: now });
      const client = d.clientId ? await ctx.db.get("clients", d.clientId) : null;
      await notify(ctx, "deadline_due", { clientId: d.clientId, data: { title: d.title, client: client?.displayName ?? "", date: formatDateIt(d.dueAt), notes: d.notes ?? "" }, ctaPath: "/admin/deadlines", dedupeSubject: d._id });
      deadlines++;
    }
    return { invoices, deadlines };
  },
});
