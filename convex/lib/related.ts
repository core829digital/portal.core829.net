import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { fail } from "./errors";

/** A cosa e' collegato un ticket o una scadenza. Tutti facoltativi; se presenti devono essere dello STESSO cliente. */
export type RelatedIds = { invoiceId?: Id<"invoices">; subscriptionId?: Id<"subscriptions">; projectId?: Id<"projects"> };
export type RelatedLabel = { kind: "invoice" | "subscription" | "project"; id: string; label: string };

/** Gli stati di una fattura che il cliente puo' vedere (le bozze e le annullate no). */
const CLIENT_VISIBLE_INVOICE = new Set(["sent", "overdue", "paid"]);

/**
 * Controlla che i collegamenti esistano e appartengano al cliente. `forClient`: regole piu' strette per le richieste
 * fatte dal cliente (solo cose che puo' vedere nel suo spazio). Non rivela mai se un id esiste ma e' di un altro cliente.
 */
export async function assertRelated(ctx: QueryCtx, clientId: Id<"clients">, ids: RelatedIds, opts: { forClient?: boolean } = {}): Promise<void> {
  if (ids.invoiceId) {
    const i = await ctx.db.get("invoices", ids.invoiceId);
    if (!i || i.clientId !== clientId || (opts.forClient && (!i.visibleToClient || !CLIENT_VISIBLE_INVOICE.has(i.status)))) return fail("NOT_FOUND", "Pagamento non trovato.");
  }
  if (ids.subscriptionId) {
    const s = await ctx.db.get("subscriptions", ids.subscriptionId);
    if (!s || s.clientId !== clientId || (opts.forClient && s.status === "cancelled")) return fail("NOT_FOUND", "Abbonamento non trovato.");
  }
  if (ids.projectId) {
    const p = await ctx.db.get("projects", ids.projectId);
    if (!p || p.clientId !== clientId) return fail("NOT_FOUND", "Progetto non trovato.");
  }
}

/** Etichette leggibili dei collegamenti (per elenchi e dettagli). */
export async function relatedLabels(ctx: QueryCtx, ids: RelatedIds): Promise<RelatedLabel[]> {
  const out: RelatedLabel[] = [];
  if (ids.subscriptionId) {
    const s: Doc<"subscriptions"> | null = await ctx.db.get("subscriptions", ids.subscriptionId);
    out.push({ kind: "subscription", id: ids.subscriptionId, label: `Abbonamento: ${s?.name ?? "eliminato"}` });
  }
  if (ids.invoiceId) {
    const i: Doc<"invoices"> | null = await ctx.db.get("invoices", ids.invoiceId);
    out.push({ kind: "invoice", id: ids.invoiceId, label: i ? `Fattura ${i.number}` : "Fattura eliminata" });
  }
  if (ids.projectId) {
    const p: Doc<"projects"> | null = await ctx.db.get("projects", ids.projectId);
    out.push({ kind: "project", id: ids.projectId, label: `Progetto: ${p?.name ?? "eliminato"}` });
  }
  return out;
}
