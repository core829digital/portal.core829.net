import type { PortalData } from "@/components/portal/PortalPage";

/**
 * Dati INVENTATI per le prove nel browser (accessibilita', contenuti non fidati). Mai usati in produzione.
 */
const D = (m: number, d: number) => Date.UTC(2026, m, d, 11);
export const fixtureData = {
  client: { displayName: "Ristorante Da Mario", contactName: "Mario", packageType: "standard", status: "active", welcomeMessage: "Benvenuto Mario!" },
  projects: [
    { id: "p1", name: "Sito web", description: "Home, menu e contatti.", status: "in_progress", progress: 60, startDate: D(10, 3), dueDate: D(10, 24), updates: [{ title: "Bozza pronta", body: "Prima bozza caricata.", at: D(10, 6) }] },
    { id: "p2", name: "Scheda Google", description: null, status: "planned", progress: 0, startDate: null, dueDate: null, updates: [] },
    { id: "p3", name: "Logo", description: null, status: "completed", progress: 100, startDate: null, dueDate: null, updates: [] },
  ],
  subscriptions: [
    { id: "s1", name: "Hosting", description: "Sito online", amountCents: 7900, currency: "EUR", interval: "year", status: "active", nextRenewalAt: D(10, 3) },
    { id: "s2", name: "Assistenza", description: null, amountCents: 2900, currency: "EUR", interval: "month", status: "paused", nextRenewalAt: null },
  ],
  billing: { currency: "EUR", outstandingCents: 39000, overdueCents: 12000, invoices: [
    { id: "i1", number: "2026/014", issuedAt: D(10, 3), dueAt: D(10, 18), amountCents: 27000, status: "sent", paidAt: null, note: "Acconto" },
    { id: "i2", number: "2026/009", issuedAt: D(9, 1), dueAt: D(9, 15), amountCents: 12000, status: "overdue", paidAt: null, note: null },
    { id: "i3", number: "2026/002", issuedAt: D(8, 1), dueAt: D(8, 15), amountCents: 5000, status: "paid", paidAt: D(8, 10), note: null },
  ] },
  widgets: ["welcome", "onboarding", "summary", "projects", "billing", "subscriptions", "documents"].map((t) => ({ id: t, type: t, enabled: true })).concat([
    { id: "n1", type: "notice", enabled: true, title: "Chiusura estiva", body: "Chiusi dal 10 al 20 agosto." } as never,
    { id: "n2", type: "notice", enabled: true, title: "<img src=x onerror=alert(1)>", body: "<script>alert('xss')</script> testo normale" } as never,
    { id: "l1", type: "links", enabled: true, title: "Link utili", items: [{ label: "Sito", url: "https://www.core829.net" }, { label: "Da non mostrare", url: "http://non-sicuro.it" }] } as never,
    { id: "c1", type: "contact", enabled: true, title: "Contatti", body: "Rispondi al messaggio ricevuto." } as never,
  ]),
} as unknown as PortalData;
