import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { defaultLayout, type Widget } from "./widgets";

const VISIBLE_INVOICE_STATUSES = new Set(["sent", "overdue", "paid"]);
const UPDATES_PER_PROJECT = 5;

/**
 * Costruisce i dati che il cliente puo' vedere, campo per campo (DTO).
 * Usata dal portale (`portal.overview`) e dall'anteprima dell'amministratore (`pages.preview`):
 * un solo punto, cosi' l'anteprima mostra esattamente quello che vedra' il cliente.
 *
 * Mai restituire documenti interi: niente `internalNotes`, `storageId`, ID di altri clienti.
 * Elenchi sempre limitati (`take`), mai `collect()`.
 */
export async function buildOverview(ctx: QueryCtx, clientId: Id<"clients">) {
  const client = await ctx.db.get("clients", clientId);
  if (!client) return null;

  const projects = await ctx.db
    .query("projects")
    .withIndex("by_clientId", (q) => q.eq("clientId", client._id))
    .order("desc")
    .take(50);

  const visibleUpdates = await ctx.db
    .query("projectUpdates")
    .withIndex("by_clientId_and_visibleToClient", (q) => q.eq("clientId", client._id).eq("visibleToClient", true))
    .order("desc")
    .take(200);
  const updatesByProject = new Map<string, { title: string; body: string; at: number }[]>();
  for (const u of visibleUpdates) {
    const list = updatesByProject.get(u.projectId) ?? [];
    if (list.length < UPDATES_PER_PROJECT) list.push({ title: u.title, body: u.body, at: u._creationTime });
    updatesByProject.set(u.projectId, list);
  }

  const subscriptions = await ctx.db
    .query("subscriptions")
    .withIndex("by_clientId", (q) => q.eq("clientId", client._id))
    .order("desc")
    .take(50);

  const invoices = (
    await ctx.db
      .query("invoices")
      .withIndex("by_clientId", (q) => q.eq("clientId", client._id))
      .order("desc")
      .take(200)
  ).filter((i) => i.visibleToClient && VISIBLE_INVOICE_STATUSES.has(i.status));

  const outstandingCents = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((sum, i) => sum + i.amountCents, 0);
  const overdueCents = invoices.filter((i) => i.status === "overdue").reduce((sum, i) => sum + i.amountCents, 0);

  const published = await ctx.db
    .query("clientReports")
    .withIndex("by_clientId_and_month", (q) => q.eq("clientId", client._id))
    .order("desc")
    .take(24);

  const requests = await ctx.db
    .query("signatureRequests")
    .withIndex("by_clientId", (q) => q.eq("clientId", client._id))
    .order("desc")
    .take(50);
  const nowMs = Date.now();
  const pendingSignatures = requests.filter((r) => (r.status === "pending" || r.status === "signing") && r.expiresAt > nowMs).length;

  return {
    pendingSignatures,
    hasReports: published.some((r) => r.status === "published"),
    client: {
      displayName: client.displayName,
      contactName: client.contactName,
      packageType: client.packageType,
      status: client.status,
      welcomeMessage: client.welcomeMessage ?? null,
    },
    projects: projects.map((p) => ({
      id: p._id,
      name: p.name,
      description: p.description ?? null,
      status: p.status,
      progress: p.progress,
      startDate: p.startDate ?? null,
      dueDate: p.dueDate ?? null,
      updates: updatesByProject.get(p._id) ?? [],
    })),
    subscriptions: subscriptions
      .filter((s) => s.status !== "cancelled")
      .map((s) => ({
        id: s._id,
        name: s.name,
        description: s.description ?? null,
        amountCents: s.amountCents,
        currency: s.currency,
        interval: s.interval,
        status: s.status,
        nextRenewalAt: s.nextRenewalAt ?? null,
      })),
    billing: {
      currency: "EUR" as const,
      outstandingCents,
      overdueCents,
      invoices: invoices.map((i) => ({
        id: i._id,
        number: i.number,
        issuedAt: i.issuedAt,
        dueAt: i.dueAt,
        amountCents: i.amountCents,
        status: i.status,
        paidAt: i.paidAt ?? null,
        note: i.note ?? null,
        // Il servizio a cui si riferisce il pagamento (lo stesso nome dell'abbonamento, cosi' il cliente li riconosce).
        subscriptionName: i.subscriptionId ? (subscriptions.find((s) => s._id === i.subscriptionId)?.name ?? null) : null,
      })),
    },
  };
}

/** Widget salvati per il cliente, oppure la pagina predefinita se non ne ha una personalizzata. */
export async function loadWidgets(ctx: QueryCtx, clientId: Id<"clients">): Promise<{ widgets: Widget[]; isCustom: boolean }> {
  const page = await ctx.db
    .query("clientPages")
    .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
    .unique();
  return page ? { widgets: page.widgets as Widget[], isCustom: true } : { widgets: defaultLayout(), isCustom: false };
}
