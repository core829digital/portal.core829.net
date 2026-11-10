/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { notify } from "./lib/notify";
import { KIND_LIST, NOTIFY_KINDS } from "./lib/notifyKinds";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.UTC(2026, 10, 15, 10, 0, 0);
const HOUR = 3_600_000;

const asUser = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId}|s1`, issuer: "https://test.local", tokenIdentifier: `https://test.local|${userId}|s1` });
const msg = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return String((e as { data?: { message?: string } }).data?.message ?? e);
  }
};

const created: ReturnType<typeof convexTest>[] = [];
async function setup() {
  const t = convexTest(schema, modules);
  created.push(t);
  await t.run((ctx) => ctx.db.insert("admins", { email: "stefan@core829.net", addedAt: Date.now() }));
  const mk = (email: string) => t.run((ctx) => ctx.db.insert("users", { email, emailVerificationTime: Date.now() }));
  const admin = asUser(t, await mk("stefan@core829.net"));
  const stranger = asUser(t, await mk("altro@esempio.it"));
  const clientId = await t.run((ctx) => ctx.db.insert("clients", { displayName: "Azienda Srl", contactName: "Anna", email: "anna@azienda.it", packageType: "standard", status: "active" }));
  const rows = () => t.run((ctx) => ctx.db.query("notifications").collect());
  const send = async (kind: Parameters<typeof notify>[1], input: Parameters<typeof notify>[2]) => t.run((ctx) => notify(ctx, kind, input));
  return { t, admin, stranger, clientId, rows, send };
}

let fetchMock: ReturnType<typeof vi.fn>;
const bodies = () => fetchMock.mock.calls.map((c) => JSON.parse(String(c[1].body)) as Record<string, unknown>);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  process.env.RESEND_API_KEY = "re_x";
  process.env.AUTH_EMAIL_FROM = "CORE829 Portale <portal@core829.net>";
  process.env.NOTIFY_ADMIN_EMAILS = "stefan@core829.net, office@core829.net";
  process.env.SITE_URL = "https://portal.core829.net";
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "m" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  // Chiude le consegne ancora pianificate, cosi' non finiscono nel test successivo.
  for (const t of created.splice(0)) await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const k of ["RESEND_API_KEY", "AUTH_EMAIL_FROM", "NOTIFY_ADMIN_EMAILS", "ADMIN_EMAILS", "SITE_URL", "CLIENTS_EMAIL_FROM"]) delete process.env[k];
});

describe("catalogo", () => {
  it("ogni tipo ha testi sensati e nessuno e' un'azione solo-admin", () => {
    expect(KIND_LIST.length).toBeGreaterThanOrEqual(15);
    for (const k of KIND_LIST) {
      const r = k.render({ number: "F1", amount: "€ 1,00", due: "1 gen", note: "", title: "Titolo", subject: "Oggetto", lines: "• Fattura 1", intro: "Introduzione", when: "scadenza domani", comment: "Commento", excerpt: "Testo del messaggio", category: "Domanda", name: "Anna", client: "Azienda", project: "Sito", text: "Testo dell'aggiornamento", month: "gennaio 2026", until: "1 gen", date: "1 gen", email: "a@b.it", message: "m", company: "", service: "", budget: "" });
      expect(r.subject.length).toBeGreaterThan(3);
      expect(r.body.length, k.kind).toBeGreaterThan(10);
      expect(r.subject + r.body).not.toMatch(/undefined|\[object/);
    }
    expect(Object.keys(NOTIFY_KINDS)).not.toContain("invoice_created");
  });
});

describe("invio", () => {
  it("al cliente: da clients@core829.net, Rispondi e copia nascosta all'indirizzo ufficiale, avviso nel testo", async () => {
    const { t, clientId, rows, send } = await setup();
    expect(await send("invoice_paid", { clientId, data: { number: "F-1", amount: "€ 100,00", due: "" } })).toBe(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [b] = bodies();
    expect(b).toMatchObject({ from: "CORE829 <clients@core829.net>", to: ["anna@azienda.it"], reply_to: "hello@core829.net", bcc: ["hello@core829.net"] });
    expect(String(b.subject)).toContain("F-1");
    expect(String(b.text)).toContain("hello@core829.net");
    expect((await rows())[0]).toMatchObject({ status: "sent", audience: "client", clientId });
  });

  it("CLIENTS_EMAIL_FROM sostituisce il mittente predefinito", async () => {
    process.env.CLIENTS_EMAIL_FROM = "CORE829 <noreply@core829.net>";
    const { t, clientId, send } = await setup();
    await send("report_published", { clientId, data: { month: "ottobre 2026" } });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(bodies()[0].from).toBe("CORE829 <noreply@core829.net>");
  });

  it("a noi: a tutti i destinatari, dal mittente del portale, con pulsante verso il portale e senza avviso «non rispondere»", async () => {
    const { t, clientId, rows, send } = await setup();
    expect(await send("document_downloaded", { clientId, data: { client: "Azienda Srl", title: "Contratto" }, ctaPath: `/admin/clients/${clientId}`, dedupeSubject: "d1" })).toBe(2);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const sent = bodies();
    expect(sent.map((b) => (b.to as string[])[0]).sort()).toEqual(["office@core829.net", "stefan@core829.net"]);
    expect(sent[0].from).toBe("CORE829 Portale <portal@core829.net>");
    expect(String(sent[0].html)).toContain(`https://portal.core829.net/admin/clients/${clientId}`);
    expect(String(sent[0].text)).not.toContain("che non viene letto");
    expect((await rows()).every((r) => r.status === "sent")).toBe(true);
  });

  it("il testo libero del cliente viene escapato nell'HTML", async () => {
    const { t, send } = await setup();
    await send("site_message", { data: { name: "<img src=x onerror=alert(1)>", email: "a@b.it", company: "", service: "", budget: "", message: "<script>x</script>" } });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const html = String(bodies()[0].html);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("un percorso esterno non diventa mai un link", async () => {
    const { t, send } = await setup();
    await send("site_message", { data: { name: "A", email: "a@b.it", company: "", service: "", budget: "", message: "ciao" }, ctaPath: "//evil.example/x" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(String(bodies()[0].html)).not.toContain("evil.example");
  });
});

describe("regole", () => {
  it("un tipo spento non genera nulla; uno spento di default si può accendere", async () => {
    const { t, admin, clientId, rows, send } = await setup();
    await admin.mutation(api.notifications.setEnabled, { kind: "invoice_paid", enabled: false });
    expect(await send("invoice_paid", { clientId, data: { number: "F", amount: "1", due: "" } })).toBe(0);
    expect(await rows()).toHaveLength(0);
    expect(await send("client_unlocked", { clientId, data: { client: "Azienda Srl" } })).toBe(0);
    await admin.mutation(api.notifications.setEnabled, { kind: "client_unlocked", enabled: true });
    expect(await send("client_unlocked", { clientId, data: { client: "Azienda Srl" } })).toBe(2);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const s = await admin.query(api.notifications.settings, {});
    expect(s.find((x) => x.kind === "invoice_paid")?.enabled).toBe(false);
    expect(s.find((x) => x.kind === "client_unlocked")?.enabled).toBe(true);
  });

  it("cliente con email automatiche disattivate: niente invio, ma resta traccia come «saltata»", async () => {
    const { clientId, rows, send, admin } = await setup();
    await admin.mutation(api.clients.update, { clientId, notifyEmail: false });
    expect(await send("invoice_paid", { clientId, data: { number: "F", amount: "1", due: "" } })).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await rows())[0]).toMatchObject({ status: "skipped", reason: expect.stringContaining("disattivate") });
  });

  it("nessun destinatario per l'amministrazione: riga «saltata» con il motivo", async () => {
    delete process.env.NOTIFY_ADMIN_EMAILS;
    const { rows, send } = await setup();
    await send("site_message", { data: { name: "A", email: "a@b.it", company: "", service: "", budget: "", message: "ciao" } });
    expect((await rows())[0]).toMatchObject({ status: "skipped", reason: expect.stringContaining("destinatario") });
  });

  it("senza NOTIFY_ADMIN_EMAILS si usa ADMIN_EMAILS", async () => {
    delete process.env.NOTIFY_ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "Stefan@core829.net";
    const { send } = await setup();
    expect(await send("site_message", { data: { name: "A", email: "a@b.it", company: "", service: "", budget: "", message: "ciao" } })).toBe(1);
  });

  it("anti-ripetizione: stesso evento nella finestra = una sola email; dopo la finestra riparte; clienti diversi non si influenzano", async () => {
    const { t, clientId, rows, send } = await setup();
    const other = await t.run((ctx) => ctx.db.insert("clients", { displayName: "Altro", contactName: "B", email: "b@esempio.it", packageType: "standard", status: "active" }));
    expect(await send("client_opened", { clientId, data: { client: "Azienda Srl" } })).toBe(2);
    expect(await send("client_opened", { clientId, data: { client: "Azienda Srl" } })).toBe(0);
    expect(await send("client_opened", { clientId: other, data: { client: "Altro" } })).toBe(2);
    vi.setSystemTime(NOW + 13 * HOUR);
    expect(await send("client_opened", { clientId, data: { client: "Azienda Srl" } })).toBe(2);
    expect(await rows()).toHaveLength(6);
  });

  it("senza Resend la riga resta «non inviata» e si può riprovare dal centro (solo se fallita)", async () => {
    delete process.env.RESEND_API_KEY;
    const { t, admin, clientId, rows, send } = await setup();
    await send("invoice_paid", { clientId, data: { number: "F", amount: "1", due: "" } });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [failed] = await rows();
    expect(failed).toMatchObject({ status: "failed" });
    expect(await msg(admin.mutation(api.notifications.retry, { notificationId: failed._id }))).toBe("OK");
    process.env.RESEND_API_KEY = "re_x";
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await rows())[0].status).toBe("sent");
    expect(await msg(admin.mutation(api.notifications.retry, { notificationId: failed._id }))).toMatch(/solo le notifiche non riuscite/);
  });

  it("errore del servizio email: «non inviata», senza dettagli sensibili", async () => {
    fetchMock.mockResolvedValue(new Response("boom a@secret.it", { status: 500 }));
    const { t, clientId, rows, send } = await setup();
    await send("invoice_paid", { clientId, data: { number: "F", amount: "1", due: "" } });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [r] = await rows();
    expect(r.status).toBe("failed");
    expect(r.reason).not.toContain("secret");
  });

  it("il flusso già inviato altrove lascia solo la traccia", async () => {
    const { clientId, rows, send } = await setup();
    await send("invoice_paid", { clientId, data: { number: "F", amount: "€ 10,00", due: "" }, logOnly: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await rows())[0]).toMatchObject({ status: "sent", reason: expect.stringContaining("flusso dedicato") });
  });
});

describe("collegamento agli eventi", () => {
  const addInvoice = (t: ReturnType<typeof convexTest>, clientId: Id<"clients">, visible: boolean) =>
    t.run((ctx) => ctx.db.insert("invoices", { clientId, number: "2026-001", issuedAt: NOW, dueAt: NOW + 30 * 24 * HOUR, amountCents: 12_300, currency: "EUR", status: "draft", visibleToClient: visible }));

  it("fattura inviata e pagata: email al cliente; se non è visibile al cliente, nessuna email", async () => {
    const { t, admin, clientId, rows } = await setup();
    const shown = await addInvoice(t, clientId, true);
    await admin.mutation(api.invoices.setStatus, { invoiceId: shown, status: "sent" });
    await admin.mutation(api.invoices.setStatus, { invoiceId: shown, status: "paid" });
    expect((await rows()).map((r) => r.kind).sort()).toEqual(["invoice_paid", "invoice_sent"]);
    expect((await rows())[0].subject).toContain("2026-001");
    const hidden = await addInvoice(t, clientId, false);
    await admin.mutation(api.invoices.setStatus, { invoiceId: hidden, status: "sent" });
    expect(await rows()).toHaveLength(2);
  });

  it("azioni solo dell'amministratore NON generano email: bozza di fattura, aggiornamento non visibile, note", async () => {
    const { t, admin, clientId, rows } = await setup();
    await addInvoice(t, clientId, true);
    const projectId = await admin.mutation(api.projects.create, { clientId, name: "Sito", status: "in_progress", progress: 10 } as never);
    await admin.mutation(api.projects.addUpdate, { projectId, title: "Nota interna", body: "solo per noi", visibleToClient: false });
    await admin.mutation(api.clients.update, { clientId, internalNotes: "nota" });
    expect(await rows()).toHaveLength(0);
    await admin.mutation(api.projects.addUpdate, { projectId, title: "Home pronta", body: "Abbiamo finito la home.", visibleToClient: true });
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "project_update", audience: "client" });
    expect(r[0].subject).toContain("Home pronta");
  });

  it("richiesta dal sito: avviso a noi, non al mittente", async () => {
    const { t, rows } = await setup();
    await t.mutation(internal.site.receiveMessage, { eventId: "e1", name: "Anna Verdi", email: "anna@azienda.it", message: "Vorremmo un sito.", service: "web" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const r = await rows();
    expect(r.every((x) => x.kind === "site_message" && x.audience === "admin")).toBe(true);
    expect(bodies().every((b) => !(b.to as string[]).includes("anna@azienda.it"))).toBe(true);
  });

  it("documento reso visibile (e già controllato) = email al cliente; nascosto o in controllo = nessuna email", async () => {
    const { t, admin, clientId, rows } = await setup();
    const add = async (scan: "clean" | "pending", visible: boolean) => {
      const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"], { type: "application/pdf" })));
      return t.run((ctx) => ctx.db.insert("documents", { clientId, kind: "other", title: "Offerta", storageId, fileName: "o.pdf", mimeType: "application/pdf", sizeBytes: 1, scanStatus: scan, visibleToClient: visible }));
    };
    const clean = await add("clean", false);
    await admin.mutation(api.documents.setVisibility, { documentId: clean, visibleToClient: false });
    expect(await rows()).toHaveLength(0);
    const pending = await add("pending", false);
    await admin.mutation(api.documents.setVisibility, { documentId: pending, visibleToClient: true });
    expect(await rows()).toHaveLength(0);
    await admin.mutation(api.documents.setVisibility, { documentId: clean, visibleToClient: true });
    expect((await rows())[0]).toMatchObject({ kind: "document_available", subject: "Nuovo documento: Offerta" });
  });

  it("report: pubblicazione = email al cliente (una volta); esportazione del cliente = avviso a noi", async () => {
    const { t, admin, clientId, rows } = await setup();
    const month = Date.UTC(2026, 9, 1);
    await t.run((ctx) => ctx.db.insert("clientReports", { clientId, month, status: "draft", summary: "Ottimo mese", metrics: [], updatedAt: NOW }));
    await admin.mutation(api.reports.setPublished, { clientId, month, published: true });
    await admin.mutation(api.reports.setPublished, { clientId, month, published: true });
    expect((await rows()).filter((r) => r.kind === "report_published")).toHaveLength(1);
    expect((await rows())[0].body).toContain("ottobre 2026");
    await t.mutation(internal.reports.logExport, { clientId, month });
    expect((await rows()).filter((r) => r.kind === "report_exported")).toHaveLength(2);
  });
});

describe("accesso", () => {
  it("solo gli amministratori leggono, cambiano o riprovano", async () => {
    const { t, stranger, clientId, send } = await setup();
    await send("invoice_paid", { clientId, data: { number: "F", amount: "1", due: "" } });
    const [n] = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(await msg(stranger.query(api.notifications.list, {}))).not.toBe("OK");
    expect(await msg(stranger.query(api.notifications.stats, {}))).not.toBe("OK");
    expect(await msg(stranger.mutation(api.notifications.setEnabled, { kind: "invoice_paid", enabled: false }))).not.toBe("OK");
    expect(await msg(stranger.mutation(api.notifications.retry, { notificationId: n._id }))).not.toBe("OK");
    expect(await msg(t.query(api.notifications.list, {}))).not.toBe("OK");
  });

  it("l'elenco filtra per cliente e stato; un tipo sconosciuto è rifiutato", async () => {
    const { t, admin, clientId, send } = await setup();
    const other = await t.run((ctx) => ctx.db.insert("clients", { displayName: "Altro", contactName: "B", email: "b@esempio.it", packageType: "standard", status: "active" }));
    await send("invoice_paid", { clientId, data: { number: "F", amount: "1", due: "" } });
    await send("invoice_paid", { clientId: other, data: { number: "G", amount: "1", due: "" } });
    expect(await admin.query(api.notifications.list, { clientId })).toHaveLength(1);
    expect(await admin.query(api.notifications.list, { status: "failed" })).toHaveLength(0);
    expect(await msg(admin.mutation(api.notifications.setEnabled, { kind: "inventato", enabled: true }))).toMatch(/sconosciuto/);
    const st = await admin.query(api.notifications.stats, {});
    expect(st.queued).toBe(2);
    expect(st.adminRecipients).toBe(2);
  });
});
