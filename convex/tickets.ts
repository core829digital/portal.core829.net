import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";
import { requireUnlock, resolveLink } from "./lib/links";
import { notify } from "./lib/notify";
import { assertRelated, relatedLabels, type RelatedIds } from "./lib/related";
import { cleanText } from "./lib/text";

/**
 * Ticket di assistenza.
 *  - Cliente: lavora solo sui PROPRI ticket (il cliente si ricava dal link, mai da un argomento) e solo dopo lo sblocco con codice.
 *  - Amministratore: vede tutto, risponde, cambia stato.
 * Limiti contro gli abusi: massimo 5 ticket aperti e 30 messaggi nelle ultime 24 ore per cliente.
 */

const category = v.union(v.literal("question"), v.literal("issue"), v.literal("request"), v.literal("billing"));
const status = v.union(v.literal("open"), v.literal("in_progress"), v.literal("waiting_client"), v.literal("closed"));

export const CATEGORY_LABEL = { question: "Domanda", issue: "Problema", request: "Richiesta di modifica", billing: "Fatture e pagamenti" } as const;
export const MAX_OPEN_TICKETS = 5;
export const MAX_MESSAGES_PER_DAY = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const excerpt = (s: string) => (s.length > 1200 ? `${s.slice(0, 1200)}…` : s);

async function assertCanWrite(ctx: MutationCtx, clientId: Id<"clients">, now: number) {
  const recent = await ctx.db
    .query("ticketMessages")
    .withIndex("by_clientId_and_author_and_createdAt", (q) => q.eq("clientId", clientId).eq("author", "client").gt("createdAt", now - DAY_MS))
    .take(MAX_MESSAGES_PER_DAY);
  if (recent.length >= MAX_MESSAGES_PER_DAY) return fail("RATE_LIMITED", "Hai inviato molti messaggi oggi. Riprova domani o scrivici per email.");
}

const relatedArgs = { invoiceId: v.optional(v.id("invoices")), subscriptionId: v.optional(v.id("subscriptions")), projectId: v.optional(v.id("projects")) };
const relatedOf = (t: Doc<"tickets">): RelatedIds => ({ invoiceId: t.invoiceId, subscriptionId: t.subscriptionId, projectId: t.projectId });

const publicMessage = (m: Doc<"ticketMessages">) => ({ id: m._id, author: m.author, body: m.body, createdAt: m.createdAt });

// ---------------------------------------------------------------- Cliente

export const portalList = query({
  args: { token: v.string(), unlockToken: v.string() },
  handler: async (ctx, args) => {
    const link = await resolveLink(ctx, args.token);
    await requireUnlock(ctx, link, args.unlockToken);
    const rows = await ctx.db
      .query("tickets")
      .withIndex("by_clientId_and_lastMessageAt", (q) => q.eq("clientId", link.clientId))
      .order("desc")
      .take(100);
    return await Promise.all(
      rows.map(async (t) => ({ id: t._id, subject: t.subject, category: t.category, status: t.status, lastMessageAt: t.lastMessageAt, lastMessageBy: t.lastMessageBy, messageCount: t.messageCount, related: (await relatedLabels(ctx, relatedOf(t))).map((r) => r.label) })),
    );
  },
});

/** Cosa puo' scegliere il cliente come «riguarda»: solo cose che vede nel suo spazio. */
export const portalRelatable = query({
  args: { token: v.string(), unlockToken: v.string() },
  handler: async (ctx, args) => {
    const link = await resolveLink(ctx, args.token);
    await requireUnlock(ctx, link, args.unlockToken);
    const [invoices, subs, projects] = await Promise.all([
      ctx.db.query("invoices").withIndex("by_clientId", (q) => q.eq("clientId", link.clientId)).order("desc").take(50),
      ctx.db.query("subscriptions").withIndex("by_clientId", (q) => q.eq("clientId", link.clientId)).order("desc").take(50),
      ctx.db.query("projects").withIndex("by_clientId", (q) => q.eq("clientId", link.clientId)).order("desc").take(50),
    ]);
    return {
      invoices: invoices.filter((i) => i.visibleToClient && ["sent", "overdue", "paid"].includes(i.status)).map((i) => ({ id: i._id, label: `Fattura ${i.number}` })),
      subscriptions: subs.filter((s) => s.status !== "cancelled").map((s) => ({ id: s._id, label: s.name })),
      projects: projects.map((p) => ({ id: p._id, label: p.name })),
    };
  },
});

export const portalGet = query({
  args: { token: v.string(), unlockToken: v.string(), ticketId: v.id("tickets") },
  handler: async (ctx, args) => {
    const link = await resolveLink(ctx, args.token);
    await requireUnlock(ctx, link, args.unlockToken);
    const t = await ctx.db.get("tickets", args.ticketId);
    if (!t || t.clientId !== link.clientId) return fail("NOT_FOUND", "Richiesta non trovata.");
    const messages = await ctx.db.query("ticketMessages").withIndex("by_ticketId_and_createdAt", (q) => q.eq("ticketId", t._id)).take(500);
    return { id: t._id, subject: t.subject, category: t.category, status: t.status, related: (await relatedLabels(ctx, relatedOf(t))).map((r) => r.label), messages: messages.map(publicMessage) };
  },
});

export const portalCreate = mutation({
  args: { token: v.string(), unlockToken: v.string(), subject: v.string(), category, body: v.string(), ...relatedArgs },
  handler: async (ctx, args): Promise<Id<"tickets">> => {
    const link = await resolveLink(ctx, args.token);
    await requireUnlock(ctx, link, args.unlockToken);
    const subject = cleanText(args.subject, { field: "oggetto", min: 3, max: 120 });
    const body = cleanText(args.body, { field: "messaggio", min: 3, max: 4000, multiline: true });
    const now = Date.now();
    const open = await ctx.db
      .query("tickets")
      .withIndex("by_clientId_and_lastMessageAt", (q) => q.eq("clientId", link.clientId))
      .order("desc")
      .take(50);
    if (open.filter((t) => t.status !== "closed").length >= MAX_OPEN_TICKETS) return fail("CONFLICT", `Hai già ${MAX_OPEN_TICKETS} richieste aperte. Aspetta una risposta o aggiungi un messaggio a una di quelle.`);
    await assertCanWrite(ctx, link.clientId, now);
    const related: RelatedIds = { invoiceId: args.invoiceId, subscriptionId: args.subscriptionId, projectId: args.projectId };
    // Il cliente puo' collegare solo cose sue e visibili nel suo spazio.
    await assertRelated(ctx, link.clientId, related, { forClient: true });
    const ticketId = await ctx.db.insert("tickets", { clientId: link.clientId, subject, category: args.category, status: "open", createdAt: now, lastMessageAt: now, lastMessageBy: "client", messageCount: 1, ...related });
    await ctx.db.insert("ticketMessages", { ticketId, clientId: link.clientId, author: "client", body, createdAt: now });
    await audit(ctx, { actorType: "client", clientId: link.clientId, action: "ticket.created", resourceType: "ticket", resourceId: ticketId });
    const client = await ctx.db.get("clients", link.clientId);
    await notify(ctx, "ticket_new", { clientId: link.clientId, data: { client: client?.displayName ?? "Cliente", subject, category: CATEGORY_LABEL[args.category], excerpt: excerpt(body) }, ctaPath: "/admin/tickets", dedupeSubject: ticketId });
    return ticketId;
  },
});

export const portalReply = mutation({
  args: { token: v.string(), unlockToken: v.string(), ticketId: v.id("tickets"), body: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const link = await resolveLink(ctx, args.token);
    await requireUnlock(ctx, link, args.unlockToken);
    const t = await ctx.db.get("tickets", args.ticketId);
    if (!t || t.clientId !== link.clientId) return fail("NOT_FOUND", "Richiesta non trovata.");
    const body = cleanText(args.body, { field: "messaggio", min: 1, max: 4000, multiline: true });
    const now = Date.now();
    await assertCanWrite(ctx, link.clientId, now);
    await ctx.db.insert("ticketMessages", { ticketId: t._id, clientId: t.clientId, author: "client", body, createdAt: now });
    // Una risposta del cliente riapre sempre la richiesta (anche se era chiusa).
    await ctx.db.patch("tickets", t._id, { status: "open", lastMessageAt: now, lastMessageBy: "client", messageCount: t.messageCount + 1, closedAt: undefined });
    await audit(ctx, { actorType: "client", clientId: t.clientId, action: "ticket.client_replied", resourceType: "ticket", resourceId: t._id });
    const client = await ctx.db.get("clients", t.clientId);
    await notify(ctx, "ticket_client_reply", { clientId: t.clientId, data: { client: client?.displayName ?? "Cliente", subject: t.subject, excerpt: excerpt(body) }, ctaPath: "/admin/tickets", dedupeSubject: t._id });
    return null;
  },
});

// ---------------------------------------------------------------- Amministratore

export const list = query({
  args: { status: v.optional(status) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows =
      args.status === undefined
        ? await ctx.db.query("tickets").order("desc").take(200)
        : await ctx.db.query("tickets").withIndex("by_status_and_lastMessageAt", (q) => q.eq("status", args.status!)).order("desc").take(200);
    const sorted = [...rows].sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    const names = new Map<string, string>();
    for (const t of sorted) if (!names.has(t.clientId)) names.set(t.clientId, (await ctx.db.get("clients", t.clientId))?.displayName ?? "Cliente eliminato");
    return await Promise.all(
      sorted.map(async (t) => ({ id: t._id, clientId: t.clientId, clientName: names.get(t.clientId) ?? "", subject: t.subject, category: t.category, status: t.status, lastMessageAt: t.lastMessageAt, lastMessageBy: t.lastMessageBy, messageCount: t.messageCount, related: (await relatedLabels(ctx, relatedOf(t))).map((r) => r.label) })),
    );
  },
});

/** Quanti ticket aspettano una nostra risposta (per il numero nel menu). */
export const waitingCount = query({
  args: {},
  handler: async (ctx): Promise<number> => {
    await requireAdmin(ctx);
    const open = await ctx.db.query("tickets").withIndex("by_status_and_lastMessageAt", (q) => q.eq("status", "open")).take(100);
    return open.length;
  },
});

export const get = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const t = await ctx.db.get("tickets", args.ticketId);
    if (!t) return null;
    const [client, messages] = await Promise.all([
      ctx.db.get("clients", t.clientId),
      ctx.db.query("ticketMessages").withIndex("by_ticketId_and_createdAt", (q) => q.eq("ticketId", t._id)).take(500),
    ]);
    return { id: t._id, clientId: t.clientId, clientName: client?.displayName ?? "Cliente eliminato", clientEmail: client?.email ?? "", subject: t.subject, category: t.category, status: t.status, invoiceId: t.invoiceId ?? null, subscriptionId: t.subscriptionId ?? null, projectId: t.projectId ?? null, related: await relatedLabels(ctx, relatedOf(t)), messages: messages.map(publicMessage) };
  },
});

/** L'amministratore collega (o scollega, con null) il ticket a un pagamento, un abbonamento, un progetto del cliente. */
export const setLinks = mutation({
  args: { ticketId: v.id("tickets"), invoiceId: v.union(v.id("invoices"), v.null()), subscriptionId: v.union(v.id("subscriptions"), v.null()), projectId: v.union(v.id("projects"), v.null()) },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const t = await ctx.db.get("tickets", args.ticketId);
    if (!t) return fail("NOT_FOUND", "Ticket non trovato.");
    const next: RelatedIds = { invoiceId: args.invoiceId ?? undefined, subscriptionId: args.subscriptionId ?? undefined, projectId: args.projectId ?? undefined };
    await assertRelated(ctx, t.clientId, next);
    await ctx.db.patch("tickets", t._id, next);
    await audit(ctx, { actorType: "admin", actorId, clientId: t.clientId, action: "ticket.links_changed", resourceType: "ticket", resourceId: t._id });
    return null;
  },
});

export const reply = mutation({
  args: { ticketId: v.id("tickets"), body: v.string(), close: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const t = await ctx.db.get("tickets", args.ticketId);
    if (!t) return fail("NOT_FOUND", "Ticket non trovato.");
    const body = cleanText(args.body, { field: "risposta", min: 1, max: 4000, multiline: true });
    const now = Date.now();
    await ctx.db.insert("ticketMessages", { ticketId: t._id, clientId: t.clientId, author: "admin", body, createdAt: now });
    const closing = args.close === true;
    await ctx.db.patch("tickets", t._id, { status: closing ? "closed" : "waiting_client", lastMessageAt: now, lastMessageBy: "admin", messageCount: t.messageCount + 1, closedAt: closing ? now : undefined });
    await audit(ctx, { actorType: "admin", actorId, clientId: t.clientId, action: closing ? "ticket.replied_and_closed" : "ticket.replied", resourceType: "ticket", resourceId: t._id });
    await notify(ctx, "ticket_admin_reply", { clientId: t.clientId, data: { subject: t.subject, excerpt: excerpt(body) } });
    return null;
  },
});

export const setStatus = mutation({
  args: { ticketId: v.id("tickets"), status },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const t = await ctx.db.get("tickets", args.ticketId);
    if (!t) return fail("NOT_FOUND", "Ticket non trovato.");
    if (t.status === args.status) return null;
    await ctx.db.patch("tickets", t._id, { status: args.status, closedAt: args.status === "closed" ? Date.now() : undefined });
    await audit(ctx, { actorType: "admin", actorId, clientId: t.clientId, action: "ticket.status_changed", resourceType: "ticket", resourceId: t._id, metadata: { from: t.status, to: args.status } });
    if (args.status === "closed") await notify(ctx, "ticket_closed", { clientId: t.clientId, data: { subject: t.subject } });
    return null;
  },
});
