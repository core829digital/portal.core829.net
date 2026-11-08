/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MAX_MESSAGES_PER_DAY, MAX_OPEN_TICKETS } from "./tickets";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.UTC(2026, 10, 15, 10, 0, 0);

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
  vi.setSystemTime(NOW);
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
const track = async () => {
  const h = await setup();
  created.push(h.t);
  return h;
};
const open = (s: { token: string; unlockToken: string }, over: Record<string, unknown> = {}) => ({ ...s, subject: "Il sito non carica", category: "issue" as const, body: "Da stamattina la home è bianca.", ...over });

describe("ticket: il cliente", () => {
  it("apre un ticket, lo vede, ci scrive; l'amministrazione riceve le email giuste", async () => {
    const h = await track();
    const s = await h.unlock(h.clientA);
    const id = await h.t.mutation(api.tickets.portalCreate, open(s));
    await h.t.mutation(api.tickets.portalReply, { ...s, ticketId: id, body: "Ora funziona a intermittenza." });
    const list = await h.t.query(api.tickets.portalList, s);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ subject: "Il sito non carica", status: "open", lastMessageBy: "client", messageCount: 2 });
    const thread = await h.t.query(api.tickets.portalGet, { ...s, ticketId: id });
    expect(thread.messages.map((m) => m.author)).toEqual(["client", "client"]);
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    const mails = sent();
    expect(mails.every((m) => m.to.includes("stefan@core829.net"))).toBe(true);
    expect(mails.map((m) => m.subject).join("|")).toContain("Nuovo ticket da Cliente a");
    // La seconda email (risposta) non parte subito dopo la prima? Si': e' un tipo diverso. Ma una terza ravvicinata viene accorpata.
    await h.t.mutation(api.tickets.portalReply, { ...s, ticketId: id, body: "Ancora io." });
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(sent().filter((m) => m.subject.includes("ha risposto"))).toHaveLength(1);
  });

  it("serve il codice di sblocco: senza, niente lettura né scrittura", async () => {
    const h = await track();
    const s = await h.unlock(h.clientA);
    const bad = { token: s.token, unlockToken: "x".repeat(43) };
    expect(await msg(h.t.query(api.tickets.portalList, bad))).toMatch(/UNLOCK_REQUIRED/);
    expect(await msg(h.t.mutation(api.tickets.portalCreate, open(bad)))).toMatch(/UNLOCK_REQUIRED/);
  });

  it("un cliente non vede né scrive nei ticket di un altro (nemmeno conoscendo l'id)", async () => {
    const h = await track();
    const a = await h.unlock(h.clientA);
    const b = await h.unlock(h.clientB);
    const id = await h.t.mutation(api.tickets.portalCreate, open(a));
    expect(await h.t.query(api.tickets.portalList, b)).toHaveLength(0);
    expect(await msg(h.t.query(api.tickets.portalGet, { ...b, ticketId: id }))).toMatch(/NOT_FOUND/);
    expect(await msg(h.t.mutation(api.tickets.portalReply, { ...b, ticketId: id, body: "intruso" }))).toMatch(/NOT_FOUND/);
  });

  it("testo pulito e limiti: oggetto troppo corto, messaggio enorme, troppi ticket aperti, troppi messaggi al giorno", async () => {
    const h = await track();
    const s = await h.unlock(h.clientA);
    expect(await msg(h.t.mutation(api.tickets.portalCreate, open(s, { subject: "ab" })))).toMatch(/VALIDATION/);
    expect(await msg(h.t.mutation(api.tickets.portalCreate, open(s, { body: "x".repeat(20000) })))).not.toBe("OK");
    for (let i = 0; i < MAX_OPEN_TICKETS; i++) await h.t.mutation(api.tickets.portalCreate, open(s, { subject: `Richiesta ${i}` }));
    expect(await msg(h.t.mutation(api.tickets.portalCreate, open(s, { subject: "Una in piu'" })))).toMatch(/CONFLICT/);
    const [first] = await h.t.query(api.tickets.portalList, s);
    for (let i = 0; i < MAX_MESSAGES_PER_DAY - MAX_OPEN_TICKETS; i++) await h.t.mutation(api.tickets.portalReply, { ...s, ticketId: first.id, body: `m${i}` });
    expect(await msg(h.t.mutation(api.tickets.portalReply, { ...s, ticketId: first.id, body: "troppo" }))).toMatch(/RATE_LIMITED/);
  });
});

describe("ticket: l'amministrazione", () => {
  it("risponde (il cliente riceve l'email da clients@ con il testo), poi chiude; il cliente riapre scrivendo", async () => {
    const h = await track();
    const s = await h.unlock(h.clientA);
    const id = await h.t.mutation(api.tickets.portalCreate, open(s));
    await h.admin.mutation(api.tickets.reply, { ticketId: id, body: "Stiamo guardando, ti aggiorniamo a breve." });
    expect((await h.admin.query(api.tickets.list, {}))[0]).toMatchObject({ status: "waiting_client", lastMessageBy: "admin", clientName: "Cliente a" });
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    const toClient = sent().filter((m) => m.to.includes("a@esempio.it"));
    expect(toClient).toHaveLength(1);
    expect(toClient[0].text).toContain("Stiamo guardando");
    await h.admin.mutation(api.tickets.setStatus, { ticketId: id, status: "closed" });
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(sent().some((m) => m.subject.startsWith("Richiesta chiusa"))).toBe(true);
    expect((await h.t.query(api.tickets.portalGet, { ...s, ticketId: id })).status).toBe("closed");
    await h.t.mutation(api.tickets.portalReply, { ...s, ticketId: id, body: "Si è ripresentato." });
    expect((await h.t.query(api.tickets.portalGet, { ...s, ticketId: id })).status).toBe("open");
    expect(await h.admin.query(api.tickets.waitingCount, {})).toBe(1);
  });

  it("«rispondi e chiudi» in un solo passo; filtri per stato", async () => {
    const h = await track();
    const s = await h.unlock(h.clientA);
    const id = await h.t.mutation(api.tickets.portalCreate, open(s));
    await h.t.mutation(api.tickets.portalCreate, open(s, { subject: "Seconda" }));
    await h.admin.mutation(api.tickets.reply, { ticketId: id, body: "Risolto: era la cache.", close: true });
    expect(await h.admin.query(api.tickets.list, { status: "closed" })).toHaveLength(1);
    expect(await h.admin.query(api.tickets.list, { status: "open" })).toHaveLength(1);
    expect(await h.admin.query(api.tickets.list, {})).toHaveLength(2);
  });

  it("solo gli amministratori: estranei e anonimi rifiutati; il cliente non vede nulla dell'altro lato", async () => {
    const h = await track();
    const s = await h.unlock(h.clientA);
    const id = await h.t.mutation(api.tickets.portalCreate, open(s));
    for (const who of [h.stranger, h.t] as (typeof h.t)[]) {
      expect(await msg(who.query(api.tickets.list, {}))).not.toBe("OK");
      expect(await msg(who.query(api.tickets.get, { ticketId: id }))).not.toBe("OK");
      expect(await msg(who.mutation(api.tickets.reply, { ticketId: id, body: "x" }))).not.toBe("OK");
      expect(await msg(who.mutation(api.tickets.setStatus, { ticketId: id, status: "closed" }))).not.toBe("OK");
    }
  });

  it("niente email se il cliente ha le email automatiche spente; il testo del cliente è escapato per l'amministrazione", async () => {
    const h = await track();
    const s = await h.unlock(h.clientA);
    const id = await h.t.mutation(api.tickets.portalCreate, open(s, { body: "<script>alert(1)</script>" }));
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    const html = fetchMock.mock.calls.map((c) => String(JSON.parse(String(c[1].body)).html)).join("");
    expect(html).not.toContain("<script>");
    await h.admin.mutation(api.clients.update, { clientId: h.clientA, notifyEmail: false });
    fetchMock.mockClear();
    await h.admin.mutation(api.tickets.reply, { ticketId: id, body: "Ciao" });
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
