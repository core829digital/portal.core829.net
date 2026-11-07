import { describe, expect, it } from "vitest";
import {
  collectedByMonth,
  collectedInMonth,
  collectedInYear,
  collectedTotal,
  monthlyRecurringCents,
  outstandingCents,
  overdue,
  percentChange,
  upcomingRenewals,
  type InvoiceLike,
  type SubscriptionLike,
} from "./metrics";

const d = (y: number, m: number, day = 1) => Date.UTC(y, m - 1, day);
const NOW = d(2026, 11, 7);

const inv = (status: InvoiceLike["status"], amountCents: number, paidAt?: number): InvoiceLike => ({
  status,
  amountCents,
  paidAt: paidAt ?? null,
  dueAt: NOW,
});

describe("incassato", () => {
  const invoices = [
    inv("paid", 1000, d(2026, 1, 4)),
    inv("paid", 2000, d(2026, 11, 2)),
    inv("paid", 500, d(2025, 12, 20)),
    inv("sent", 9999),
    inv("draft", 7777),
    inv("cancelled", 5555),
    inv("paid", 300), // pagata ma senza data: non si puo' assegnare a un mese
  ];
  it("conta solo le fatture pagate con data, nell'anno corrente", () => {
    expect(collectedInYear(invoices, NOW)).toBe(3000);
  });
  it("totale: tutte le pagate con data, di ogni anno", () => {
    expect(collectedTotal(invoices)).toBe(3500);
  });
  it("per mese: 12 mesi consecutivi, mesi vuoti a zero, nessuna fattura fuori finestra", () => {
    const series = collectedByMonth(invoices, NOW, 12);
    expect(series).toHaveLength(12);
    expect(series[0].monthStart).toBe(d(2025, 12));
    expect(series[11].monthStart).toBe(d(2026, 11));
    expect(series[0].cents).toBe(500);
    expect(series[1].cents).toBe(1000);
    expect(series[11].cents).toBe(2000);
    expect(series.reduce((s, m) => s + m.cents, 0)).toBe(3500);
    expect(collectedByMonth(invoices, NOW, 3).reduce((s, m) => s + m.cents, 0)).toBe(2000);
  });
  it("incassato di un mese", () => {
    expect(collectedInMonth(invoices, d(2026, 11, 15))).toBe(2000);
    expect(collectedInMonth(invoices, d(2026, 10))).toBe(0);
  });
});

describe("da incassare e scaduto", () => {
  const invoices = [inv("sent", 1000), inv("overdue", 2000), inv("overdue", 500), inv("paid", 99), inv("draft", 77), inv("cancelled", 55)];
  it("da incassare = inviate + scadute, mai bozze o annullate", () => {
    expect(outstandingCents(invoices)).toBe(3500);
  });
  it("scaduto: importo e numero", () => {
    expect(overdue(invoices)).toEqual({ cents: 2500, count: 2 });
  });
});

describe("ricavi ricorrenti", () => {
  const subs: SubscriptionLike[] = [
    { status: "active", amountCents: 10700, interval: "month" },
    { status: "active", amountCents: 18000, interval: "year", nextRenewalAt: d(2026, 11, 20) },
    { status: "paused", amountCents: 99999, interval: "month" },
    { status: "cancelled", amountCents: 15000, interval: "month" },
  ];
  it("MRR: solo attivi, annuali divisi per 12", () => {
    expect(monthlyRecurringCents(subs)).toBe(10700 + 1500);
  });
  it("rinnovi nei prossimi 30 giorni", () => {
    expect(upcomingRenewals(subs, NOW, 30)).toEqual({ count: 1, cents: 18000 });
    expect(upcomingRenewals(subs, NOW, 5)).toEqual({ count: 0, cents: 0 });
  });
});

describe("variazione percentuale", () => {
  it("calcola e rifiuta confronti senza senso", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(10, 0)).toBeNull();
  });
});
