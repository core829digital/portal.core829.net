/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { PAYMENT_NOTICE } from "./lib/notifyKinds";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.UTC(2026, 10, 10, 9, 35, 0); // 10 novembre 2026, 10:35 a Roma (ora solare)

const asUser = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId}|s1`, issuer: "https://test.local", tokenIdentifier: `https://test.local|${userId}|s1` });
const msg = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    const d = (e as { data?: { code?: string; message?: string } }).data;
    return d ? `${d.code}: ${d.message}` : String(e);
  }
};

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: "stefan@core829.net", addedAt: Date.now() }));
  const mk = (email: string) => t.run((ctx) => ctx.db.insert("users", { email, emailVerificationTime: Date.now() }));
  const admin = asUser(t, await mk("stefan@core829.net"));
  const stranger = asUser(t, await mk("altro@esempio.it"));
  const client = (n: string) => t.run((ctx) => ctx.db.insert("clients", { displayName: `Cliente ${n}`, contactName: n, email: `${n}@esempio.it`, packageType: "standard", status: "active" }));
  const clientA = await client("a");
  const clientB = await client("b");
  const unlock = async (clientId: Id<"clients">) => {
    const link = await admin.mutation(api.accessLinks.create, { clientId });
    const { code } = await t.mutation(internal.otp.issueCode, { linkId: link.linkId });
    const r = await t.mutation(api.otp.verifyCode, { token: link.token, code });
    if (!r.ok) throw new Error("sblocco fallito");
    return { token: link.token, unlockToken: r.unlockToken };
  };
  return { t, admin, stranger, clientA, clientB, unlock };
}

let fetchMock: ReturnType<typeof vi.fn>;
const sent = () => fetchMock.mock.calls.map((c) => JSON.parse(String(c[1].body)) as { to: string[]; subject: string; text: string });
const created: ReturnType<typeof convexTest>[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  process.env.RESEND_API_KEY = "re_x";
  process.env.AUTH_EMAIL_FROM = "CORE829 <portal@core829.net>";
  process.env.NOTIFY_ADMIN_EMAILS = "stefan@core829.net";
  fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  for (const t of created.splice(0)) await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const k of ["RESEND_API_KEY", "AUTH_EMAIL_FROM", "NOTIFY_ADMIN_EMAILS"]) delete process.env[k];
});
/** Il tempo di convex-test avanza soltanto: ogni test parte da un'ora iniziale e poi va avanti. */
const track = async (start = "2026-11-10T06:00:00Z") => {
  vi.setSystemTime(new Date(start));
  const h = await setup();
  created.push(h.t);
  return h;
};

const noon = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 11, 0, 0); // come le scadenze salvate dal portale
const setNow = (iso: string) => vi.setSystemTime(new Date(iso));

async function seed(h: Awaited<ReturnType<typeof track>>) {
  const { t, clientA, clientB } = h;
  await t.run(async (ctx) => {
    const inv = { currency: "EUR" as const, issuedAt: NOW, visibleToClient: true };
    await ctx.db.insert("invoices", { ...inv, clientId: clientA, number: "2026/001", dueAt: noon(2026, 11, 11), amountCents: 39_000, status: "sent" }); // domani
    await ctx.db.insert("subscriptions", { clientId: clientA, name: "Server dedicato", amountCents: 6_500, currency: "EUR", interval: "month", status: "active", startedAt: NOW - 90 * 86_400_000, nextRenewalAt: noon(2026, 11, 11) }); // domani
    await ctx.db.insert("invoices", { ...inv, clientId: clientA, number: "2026/002", dueAt: noon(2026, 11, 10), amountCents: 1_000, status: "sent" }); // oggi: no
    await ctx.db.insert("invoices", { ...inv, clientId: clientA, number: "2026/003", dueAt: noon(2026, 11, 12), amountCents: 1_000, status: "sent" }); // dopodomani: no
    await ctx.db.insert("invoices", { ...inv, clientId: clientA, number: "2026/004", dueAt: noon(2026, 11, 11), amountCents: 1_000, status: "paid" }); // pagata: no
    await ctx.db.insert("invoices", { ...inv, clientId: clientA, number: "2026/005", dueAt: noon(2026, 11, 11), amountCents: 1_000, status: "draft" }); // bozza: no
    await ctx.db.insert("invoices", { ...inv, clientId: clientA, number: "2026/006", dueAt: noon(2026, 11, 11), amountCents: 1_000, status: "sent", visibleToClient: false }); // nascosta: no
    await ctx.db.insert("subscriptions", { clientId: clientA, name: "Annullato", amountCents: 1_000, currency: "EUR", interval: "month", status: "cancelled", startedAt: NOW, nextRenewalAt: noon(2026, 11, 11) }); // annullato: no
    await ctx.db.insert("subscriptions", { clientId: clientB, name: "Hosting sito", amountCents: 2_900, currency: "EUR", interval: "month", status: "active", startedAt: NOW - 30 * 86_400_000, nextRenewalAt: noon(2026, 11, 11) }); // domani
  });
}
const mailsTo = (addr: string) => sent().filter((m) => m.to.includes(addr));

describe("promemoria automatico: il giorno prima, dalle 10:30 ora italiana", () => {
  it("una email per cliente con tutte le scadenze di domani, con l'avviso sui costi aggiuntivi", async () => {
    const h = await track();
    await seed(h);
    setNow("2026-11-10T09:35:00Z");
    expect(await h.t.mutation(internal.paymentReminders.runAuto, {})).toEqual({ clients: 2, sent: 2 });
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    const a = mailsTo("a@esempio.it");
    expect(a).toHaveLength(1);
    expect(a[0].subject).toBe("Promemoria di pagamento: scadenza domani");
    expect(a[0].text).toContain("Pagamento n. 2026/001 · 390,00 € · scade il 11/11/2026");
    expect(a[0].text).toContain("Rinnovo: Server dedicato · 65,00 € · scade il 11/11/2026");
    expect(a[0].text).toContain("costi aggiuntivi");
    expect(a[0].text).toContain("ricostruire il server da capo");
    expect(a[0].text).toContain(PAYMENT_NOTICE);
    for (const escluso of ["2026/002", "2026/003", "2026/004", "2026/005", "2026/006", "Annullato"]) expect(a[0].text).not.toContain(escluso);
    // Mai la parola «fattura» nelle email ai clienti (non tutti gli abbonamenti passano da una fattura).
    for (const m of fetchMock.mock.calls.map((c) => JSON.parse(String(c[1].body)) as { subject: string; text: string; html: string })) {
      expect(`${m.subject} ${m.text} ${m.html}`).not.toMatch(/fattur/i);
    }
    expect(mailsTo("b@esempio.it")).toHaveLength(1);
    expect(mailsTo("b@esempio.it")[0].text).toContain("Hosting sito");
    expect(mailsTo("b@esempio.it")[0].text).not.toContain("Server dedicato"); // niente dati di un altro cliente
  });

  it("non rimanda: seconda esecuzione e ore successive non creano doppioni", async () => {
    const h = await track();
    await seed(h);
    setNow("2026-11-10T09:35:00Z");
    await h.t.mutation(internal.paymentReminders.runAuto, {});
    expect(await h.t.mutation(internal.paymentReminders.runAuto, {})).toEqual({ clients: 0, sent: 0 });
    setNow("2026-11-10T13:35:00Z"); // 14:35
    expect(await h.t.mutation(internal.paymentReminders.runAuto, {})).toEqual({ clients: 0, sent: 0 });
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(sent()).toHaveLength(2);
  });

  it("finestra oraria: niente prima delle 10:30 (alle 10:30 si parte)", async () => {
    const h = await track();
    await seed(h);
    for (const iso of ["2026-11-10T08:00:00Z", "2026-11-10T09:29:00Z"]) {
      setNow(iso);
      expect(await h.t.mutation(internal.paymentReminders.runAuto, {})).toEqual({ clients: 0, sent: 0 });
    }
    setNow("2026-11-10T09:30:00Z"); // 10:30
    expect((await h.t.mutation(internal.paymentReminders.runAuto, {})).sent).toBe(2);
  });

  it("finestra oraria: fino alle 18:59 si spedisce (recupero di un ritardo), dalle 19:00 no", async () => {
    const late = await track();
    await seed(late);
    setNow("2026-11-10T17:59:00Z"); // 18:59
    expect((await late.t.mutation(internal.paymentReminders.runAuto, {})).sent).toBe(2);
    const tooLate = await track();
    await seed(tooLate);
    setNow("2026-11-10T18:00:00Z"); // 19:00
    expect(await tooLate.t.mutation(internal.paymentReminders.runAuto, {})).toEqual({ clients: 0, sent: 0 });
  });

  it("vale anche con l'ora legale: 10:30 a Roma = 08:30 UTC", async () => {
    const h = await track("2026-07-14T06:00:00Z");
    await h.t.run((ctx) => ctx.db.insert("invoices", { clientId: h.clientA, number: "S/1", issuedAt: NOW, dueAt: noon(2026, 7, 15), amountCents: 10_000, currency: "EUR", status: "sent", visibleToClient: true }));
    setNow("2026-07-14T08:29:00Z"); // 10:29 a Roma
    expect((await h.t.mutation(internal.paymentReminders.runAuto, {})).sent).toBe(0);
    setNow("2026-07-14T08:30:00Z"); // 10:30 a Roma
    expect((await h.t.mutation(internal.paymentReminders.runAuto, {})).sent).toBe(1);
  });

  it("il cambio d'ora non sposta il giorno: il 28/3 (vigilia del passaggio a ora legale) le scadenze del 29/3 partono", async () => {
    const h = await track("2026-03-28T06:00:00Z");
    await h.t.run((ctx) => ctx.db.insert("invoices", { clientId: h.clientA, number: "C/1", issuedAt: NOW, dueAt: noon(2026, 3, 29), amountCents: 10_000, currency: "EUR", status: "sent", visibleToClient: true }));
    setNow("2026-03-28T09:30:00Z"); // 10:30 a Roma, ancora ora solare
    expect((await h.t.mutation(internal.paymentReminders.runAuto, {})).sent).toBe(1);
  });

  it("cliente con email automatiche spente: nessun invio e nessuna riga «saltata» a ogni ora", async () => {
    const h = await track();
    await seed(h);
    await h.admin.mutation(api.clients.update, { clientId: h.clientA, notifyEmail: false });
    for (const iso of ["2026-11-10T09:35:00Z", "2026-11-10T10:35:00Z", "2026-11-10T11:35:00Z"]) {
      setNow(iso);
      await h.t.mutation(internal.paymentReminders.runAuto, {});
    }
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(mailsTo("a@esempio.it")).toHaveLength(0);
    expect(mailsTo("b@esempio.it")).toHaveLength(1);
    expect((await h.t.run((ctx) => ctx.db.query("notifications").collect())).filter((n) => n.status === "skipped")).toHaveLength(0);
  });

  it("interruttore nel Centro notifiche: spento = niente invio automatico", async () => {
    const h = await track();
    await seed(h);
    await h.admin.mutation(api.notifications.setEnabled, { kind: "payment_reminder", enabled: false });
    setNow("2026-11-10T09:35:00Z");
    expect(await h.t.mutation(internal.paymentReminders.runAuto, {})).toMatchObject({ sent: 0 });
    expect(sent()).toHaveLength(0);
    await h.admin.mutation(api.notifications.setEnabled, { kind: "payment_reminder", enabled: true });
    expect((await h.t.mutation(internal.paymentReminders.runAuto, {})).sent).toBe(2); // riprende: le scadenze non erano state segnate come inviate
  });
});

describe("invio a mano con un clic", () => {
  // Per i test a mano l'ora e' quella di NOW (10:35 del 10/11).
  const seedNow = async (h: Awaited<ReturnType<typeof track>>) => {
    await seed(h);
    setNow("2026-11-10T09:35:00Z");
  };
  it("anteprima: scadenze da oggi ai prossimi N giorni, per cliente, con totali", async () => {
    const h = await track();
    await seedNow(h);
    const p = await h.admin.query(api.paymentReminders.preview, { nowMs: NOW, days: 7 });
    expect(p.autoEnabled).toBe(true);
    expect(p.clients.map((c) => c.name)).toEqual(["Cliente a", "Cliente b"]);
    const a = p.clients[0];
    expect(a.items.map((i) => i.label)).toEqual(["Pagamento n. 2026/002", "Pagamento n. 2026/001", "Rinnovo: Server dedicato", "Pagamento n. 2026/003"]); // ordine per data, poi inserimento
    expect(a.totalCents).toBe(1_000 + 39_000 + 6_500 + 1_000);
    expect((await h.admin.query(api.paymentReminders.preview, { nowMs: NOW, days: 1 })).clients[0].items.map((i) => i.label)).not.toContain("Pagamento n. 2026/003");
  });

  it("«invia a tutti»: un'email a ogni cliente con scadenze; il secondo clic non crea doppioni", async () => {
    const h = await track();
    await seedNow(h);
    expect(await h.admin.mutation(api.paymentReminders.sendNow, { days: 7 })).toEqual({ sent: 2, optedOut: 0, alreadySent: 0 });
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(mailsTo("a@esempio.it")).toHaveLength(1);
    expect(mailsTo("a@esempio.it")[0].text).toContain(PAYMENT_NOTICE);
    expect(mailsTo("a@esempio.it")[0].subject).toBe("Promemoria di pagamento: prossime scadenze");
    expect(await h.admin.mutation(api.paymentReminders.sendNow, { days: 7 })).toEqual({ sent: 0, optedOut: 0, alreadySent: 2 });
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(sent()).toHaveLength(2);
  });

  it("invio ai soli clienti scelti; i clienti esclusi dalle email non ricevono nulla ma vengono contati", async () => {
    const h = await track();
    await seedNow(h);
    expect(await h.admin.mutation(api.paymentReminders.sendNow, { days: 7, clientIds: [h.clientB] })).toEqual({ sent: 1, optedOut: 0, alreadySent: 0 });
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(mailsTo("a@esempio.it")).toHaveLength(0);
    await h.admin.mutation(api.clients.update, { clientId: h.clientA, notifyEmail: false });
    expect(await h.admin.mutation(api.paymentReminders.sendNow, { days: 7, clientIds: [h.clientA] })).toEqual({ sent: 0, optedOut: 1, alreadySent: 0 });
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(mailsTo("a@esempio.it")).toHaveLength(0);
  });

  it("l'invio a mano funziona anche con l'automatico spento", async () => {
    const h = await track();
    await seedNow(h);
    await h.admin.mutation(api.notifications.setEnabled, { kind: "payment_reminder", enabled: false });
    expect((await h.admin.query(api.paymentReminders.preview, { nowMs: NOW, days: 7 })).autoEnabled).toBe(false);
    expect((await h.admin.mutation(api.paymentReminders.sendNow, { days: 7 })).sent).toBe(2);
  });

  it("solo gli amministratori; i giorni vengono limitati a 1-60; resta una riga di audit", async () => {
    const h = await track();
    await seedNow(h);
    for (const who of [h.stranger, h.t] as (typeof h.t)[]) {
      expect(await msg(who.query(api.paymentReminders.preview, { nowMs: NOW, days: 7 }))).not.toBe("OK");
      expect(await msg(who.mutation(api.paymentReminders.sendNow, { days: 7 }))).not.toBe("OK");
    }
    expect(sent()).toHaveLength(0);
    await h.admin.mutation(api.paymentReminders.sendNow, { days: 99999 });
    const log = await h.t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(log.find((l) => l.action === "payment_reminders.sent_manually")?.metadata).toMatchObject({ days: 60, sent: 2 });
  });
});
