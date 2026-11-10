import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { INVOICE_TRANSITIONS, isInvoiceFinal } from "./lib/invoiceFlow";
import { fail } from "./lib/errors";
import { notify } from "./lib/notify";
import { closeLinkedDeadlines } from "./deadlines";
import { formatDateIt, formatEuroIt } from "./lib/reminders";
import { assertCents, assertTimestamp, cleanText, invalid } from "./lib/text";
import { invoiceStatus } from "./lib/validators";

const nullableString = v.optional(v.union(v.string(), v.null()));

function cleanInvoiceNumber(raw: unknown): string {
  const s = cleanText(raw, { field: "numero fattura", min: 1, max: 40 });
  if (!/^[A-Za-z0-9/_.-]+$/.test(s)) invalid("numero fattura", "Usa solo lettere, cifre e / _ . -");
  return s;
}

export const create = mutation({
  args: {
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    subscriptionId: v.optional(v.id("subscriptions")),
    number: v.string(),
    issuedAt: v.number(),
    dueAt: v.number(),
    amountCents: v.number(),
    note: v.optional(v.string()),
    visibleToClient: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const client = await ctx.db.get("clients", args.clientId);
    if (!client) return fail("NOT_FOUND", "Cliente non trovato.");

    if (args.projectId !== undefined) {
      const project = await ctx.db.get("projects", args.projectId);
      // Il progetto deve appartenere allo stesso cliente.
      if (!project || project.clientId !== args.clientId) return fail("NOT_FOUND", "Progetto non trovato.");
    }

    if (args.subscriptionId !== undefined) {
      const sub = await ctx.db.get("subscriptions", args.subscriptionId);
      // L'abbonamento deve essere dello stesso cliente e non annullato.
      if (!sub || sub.clientId !== args.clientId) return fail("NOT_FOUND", "Abbonamento non trovato.");
      if (sub.status === "cancelled") return fail("BAD_STATE", "L'abbonamento è annullato.");
    }

    const number = cleanInvoiceNumber(args.number);
    const duplicate = await ctx.db
      .query("invoices")
      .withIndex("by_number", (q) => q.eq("number", number))
      .first();
    if (duplicate) return fail("CONFLICT", "Esiste già una fattura con questo numero.");

    const issuedAt = assertTimestamp(args.issuedAt, "data di emissione");
    const dueAt = assertTimestamp(args.dueAt, "data di scadenza");
    if (dueAt < issuedAt) invalid("data di scadenza", "La scadenza non può precedere l'emissione.");

    const invoiceId = await ctx.db.insert("invoices", {
      clientId: args.clientId,
      projectId: args.projectId,
      subscriptionId: args.subscriptionId,
      number,
      issuedAt,
      dueAt,
      amountCents: assertCents(args.amountCents),
      currency: "EUR",
      status: "draft",
      note: args.note === undefined ? undefined : cleanText(args.note, { field: "nota", max: 500, multiline: true }),
      visibleToClient: args.visibleToClient ?? true,
    });
    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: args.clientId,
      action: "invoice.created",
      resourceType: "invoice",
      resourceId: invoiceId,
      metadata: { amountCents: args.amountCents },
    });
    return invoiceId;
  },
});

export const update = mutation({
  args: {
    invoiceId: v.id("invoices"),
    dueAt: v.optional(v.number()),
    amountCents: v.optional(v.number()),
    note: nullableString,
    visibleToClient: v.optional(v.boolean()),
    documentId: v.optional(v.union(v.id("documents"), v.null())),
  },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const invoice = await ctx.db.get("invoices", args.invoiceId);
    if (!invoice) return fail("NOT_FOUND", "Fattura non trovata.");
    // Una fattura pagata o annullata non si modifica piu'.
    if (isInvoiceFinal(invoice.status)) {
      return fail("BAD_STATE", "Questa fattura non è più modificabile.");
    }

    const patch: Partial<Omit<Doc<"invoices">, "_id" | "_creationTime" | "clientId">> = {};
    if (args.dueAt !== undefined) {
      const dueAt = assertTimestamp(args.dueAt, "data di scadenza");
      if (dueAt < invoice.issuedAt) invalid("data di scadenza", "La scadenza non può precedere l'emissione.");
      patch.dueAt = dueAt;
    }
    if (args.amountCents !== undefined) patch.amountCents = assertCents(args.amountCents);
    if (args.note !== undefined) {
      patch.note = args.note === null ? undefined : cleanText(args.note, { field: "nota", max: 500, multiline: true });
    }
    if (args.visibleToClient !== undefined) patch.visibleToClient = args.visibleToClient;
    if (args.documentId !== undefined) {
      if (args.documentId === null) {
        patch.documentId = undefined;
      } else {
        const document = await ctx.db.get("documents", args.documentId);
        // Il PDF deve appartenere allo stesso cliente della fattura.
        if (!document || document.clientId !== invoice.clientId) return fail("NOT_FOUND", "Documento non trovato.");
        patch.documentId = args.documentId;
      }
    }

    const fields = Object.keys(patch);
    if (fields.length === 0) return null;
    await ctx.db.patch("invoices", args.invoiceId, patch);
    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: invoice.clientId,
      action: "invoice.updated",
      resourceType: "invoice",
      resourceId: args.invoiceId,
      metadata: { fields: fields.join(",") },
    });
    return null;
  },
});

export const setStatus = mutation({
  args: { invoiceId: v.id("invoices"), status: invoiceStatus, paidAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const invoice = await ctx.db.get("invoices", args.invoiceId);
    if (!invoice) return fail("NOT_FOUND", "Fattura non trovata.");
    if (!INVOICE_TRANSITIONS[invoice.status].includes(args.status)) {
      return fail("BAD_STATE", "Questo cambio di stato non è consentito.");
    }
    const patch: Partial<Doc<"invoices">> = { status: args.status };
    if (args.status === "paid" || args.status === "cancelled") await closeLinkedDeadlines(ctx, { invoiceId: invoice._id });
    if (args.status === "paid") {
      patch.paidAt = args.paidAt === undefined ? Date.now() : assertTimestamp(args.paidAt, "data di pagamento");
    }
    await ctx.db.patch("invoices", args.invoiceId, patch);
    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: invoice.clientId,
      action: "invoice.status_changed",
      resourceType: "invoice",
      resourceId: args.invoiceId,
      metadata: { from: invoice.status, to: args.status },
    });
    if (invoice.visibleToClient) {
      const data = { number: invoice.number, amount: formatEuroIt(invoice.amountCents), due: formatDateIt(invoice.dueAt), note: invoice.note ?? "" };
      if (args.status === "sent") await notify(ctx, "invoice_sent", { clientId: invoice.clientId, data, dedupeSubject: invoice._id });
      if (args.status === "paid") await notify(ctx, "invoice_paid", { clientId: invoice.clientId, data });
    }
    return null;
  },
});

/** Collega (o scollega, con null) un pagamento a un abbonamento. Vale anche sui pagamenti gia' chiusi: serve a sistemare lo storico. */
export const setSubscription = mutation({
  args: { invoiceId: v.id("invoices"), subscriptionId: v.union(v.id("subscriptions"), v.null()) },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const invoice = await ctx.db.get("invoices", args.invoiceId);
    if (!invoice) return fail("NOT_FOUND", "Pagamento non trovato.");
    if (args.subscriptionId !== null) {
      const sub = await ctx.db.get("subscriptions", args.subscriptionId);
      if (!sub || sub.clientId !== invoice.clientId) return fail("NOT_FOUND", "Abbonamento non trovato.");
    }
    await ctx.db.patch("invoices", args.invoiceId, { subscriptionId: args.subscriptionId ?? undefined });
    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: invoice.clientId,
      action: "invoice.subscription_linked",
      resourceType: "invoice",
      resourceId: args.invoiceId,
      metadata: { subscriptionId: args.subscriptionId ?? "none" },
    });
    return null;
  },
});

export const listByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(200);
    const names = new Map<string, string>();
    for (const i of invoices) {
      if (!i.subscriptionId || names.has(i.subscriptionId)) continue;
      const sub = await ctx.db.get("subscriptions", i.subscriptionId);
      names.set(i.subscriptionId, sub?.name ?? "Abbonamento eliminato");
    }
    return invoices.map((i) => ({ ...i, subscriptionName: i.subscriptionId ? names.get(i.subscriptionId) : undefined }));
  },
});

/**
 * Collegamenti proposti per lo storico: un pagamento non collegato viene proposto solo se il cliente ha UN SOLO abbonamento
 * non annullato con lo stesso importo. Nei casi dubbi (piu' candidati) non propone nulla: decide l'amministratore.
 */
async function computeSuggestions(ctx: QueryCtx, clientId: Id<"clients">) {
  const subs = (await ctx.db.query("subscriptions").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(100)).filter((s) => s.status !== "cancelled");
  const invoices = await ctx.db.query("invoices").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(200);
  const out: { invoiceId: Id<"invoices">; number: string; subscriptionId: Id<"subscriptions">; subscriptionName: string }[] = [];
  for (const i of invoices) {
    if (i.subscriptionId || i.status === "cancelled") continue;
    const matches = subs.filter((s) => s.amountCents === i.amountCents);
    if (matches.length === 1) out.push({ invoiceId: i._id, number: i.number, subscriptionId: matches[0]._id, subscriptionName: matches[0].name });
  }
  return out;
}

export const linkSuggestions = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await computeSuggestions(ctx, args.clientId);
  },
});

/** Applica in un colpo i collegamenti proposti per il cliente. */
export const applyLinkSuggestions = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args): Promise<number> => {
    const { actorId } = await requireAdmin(ctx);
    const list = await computeSuggestions(ctx, args.clientId);
    for (const s of list) {
      await ctx.db.patch("invoices", s.invoiceId, { subscriptionId: s.subscriptionId });
      await audit(ctx, { actorType: "admin", actorId, clientId: args.clientId, action: "invoice.subscription_linked", resourceType: "invoice", resourceId: s.invoiceId, metadata: { subscriptionId: s.subscriptionId, auto: "suggested" } });
    }
    return list.length;
  },
});
