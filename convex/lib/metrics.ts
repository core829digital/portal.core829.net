/**
 * Metriche della dashboard: funzioni PURE (niente database, niente orologio: l'ora arriva dal chiamante).
 * Le usano sia il server (dashboard admin) sia il browser (dashboard del cliente), cosi' le definizioni
 * dei numeri sono identiche ovunque. Tutti gli importi sono interi in centesimi, i mesi sono UTC.
 *
 * DEFINIZIONI (vincolanti):
 *  - Incassato: somma delle fatture in stato "paid", assegnate al mese/anno di `paidAt`.
 *  - Da incassare: fatture "sent" + "overdue" (le bozze e le annullate NON contano mai).
 *  - Scaduto: fatture "overdue".
 *  - MRR (ricavi ricorrenti mensili): abbonamenti ATTIVI, con quelli annuali divisi per 12. ARR = MRR x 12.
 *    Gli abbonamenti in pausa o annullati non contano.
 */

export type InvoiceLike = {
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  amountCents: number;
  paidAt?: number | null;
  dueAt: number;
};

export type SubscriptionLike = {
  status: "active" | "paused" | "cancelled";
  amountCents: number;
  interval: "month" | "year";
  nextRenewalAt?: number | null;
};

export const DAY = 24 * 60 * 60 * 1000;

export function monthStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** Inizi degli ultimi `count` mesi, dal piu' vecchio al corrente (incluso). */
export function lastMonthStarts(nowMs: number, count: number): number[] {
  const d = new Date(nowMs);
  const out: number[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
  return out;
}

export function yearStart(ms: number): number {
  return Date.UTC(new Date(ms).getUTCFullYear(), 0, 1);
}

const isPaid = (i: InvoiceLike): i is InvoiceLike & { paidAt: number } => i.status === "paid" && typeof i.paidAt === "number";

/** Incassato per mese negli ultimi `count` mesi (anche i mesi senza incassi, a zero). */
export function collectedByMonth(invoices: InvoiceLike[], nowMs: number, count = 12): { monthStart: number; cents: number }[] {
  const starts = lastMonthStarts(nowMs, count);
  const totals = new Map<number, number>(starts.map((s) => [s, 0]));
  for (const i of invoices) {
    if (!isPaid(i)) continue;
    const key = monthStart(i.paidAt);
    if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + i.amountCents);
  }
  return starts.map((s) => ({ monthStart: s, cents: totals.get(s) ?? 0 }));
}

/** Incassato dall'inizio dell'anno di `nowMs` fino a `nowMs`. */
export function collectedInYear(invoices: InvoiceLike[], nowMs: number): number {
  const from = yearStart(nowMs);
  return invoices.reduce((sum, i) => (isPaid(i) && i.paidAt >= from && i.paidAt <= nowMs + DAY ? sum + i.amountCents : sum), 0);
}

export function collectedInMonth(invoices: InvoiceLike[], monthStartMs: number): number {
  const key = monthStart(monthStartMs);
  return invoices.reduce((sum, i) => (isPaid(i) && monthStart(i.paidAt) === key ? sum + i.amountCents : sum), 0);
}

export function collectedTotal(invoices: InvoiceLike[]): number {
  return invoices.reduce((sum, i) => (isPaid(i) ? sum + i.amountCents : sum), 0);
}

export function outstandingCents(invoices: InvoiceLike[]): number {
  return invoices.reduce((sum, i) => (i.status === "sent" || i.status === "overdue" ? sum + i.amountCents : sum), 0);
}

export function overdue(invoices: InvoiceLike[]): { cents: number; count: number } {
  let cents = 0;
  let count = 0;
  for (const i of invoices) {
    if (i.status === "overdue") {
      cents += i.amountCents;
      count++;
    }
  }
  return { cents, count };
}

/** MRR in centesimi: abbonamenti attivi, gli annuali divisi per 12 (arrotondato). */
export function monthlyRecurringCents(subs: SubscriptionLike[]): number {
  let total = 0;
  for (const s of subs) {
    if (s.status !== "active") continue;
    total += s.interval === "year" ? s.amountCents / 12 : s.amountCents;
  }
  return Math.round(total);
}

/** Rinnovi di abbonamenti attivi nei prossimi `days` giorni (oggi incluso). */
export function upcomingRenewals(subs: SubscriptionLike[], nowMs: number, days = 30): { count: number; cents: number } {
  const from = nowMs - DAY;
  const to = nowMs + days * DAY;
  let count = 0;
  let cents = 0;
  for (const s of subs) {
    if (s.status !== "active" || typeof s.nextRenewalAt !== "number") continue;
    if (s.nextRenewalAt >= from && s.nextRenewalAt <= to) {
      count++;
      cents += s.amountCents;
    }
  }
  return { count, cents };
}

/** Variazione percentuale (intera) rispetto a un valore precedente; null se il confronto non ha senso. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
