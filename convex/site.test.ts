/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { cleanAnnouncement, parseTrackedPath } from "./lib/siteConfig";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const SECRET = "whsec_" + btoa("0123456789abcdef0123456789abcdef");
const NOW = Date.UTC(2026, 10, 15, 10, 0, 0);

async function sign(id: string, ts: number, body: string, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  return "v1," + btoa(String.fromCharCode(...mac));
}
async function post(t: ReturnType<typeof convexTest>, path: string, payload: unknown, opts: { id?: string; secret?: string; ts?: number; raw?: string } = {}) {
  const body = opts.raw ?? JSON.stringify(payload);
  const id = opts.id ?? `evt_${Math.random().toString(36).slice(2)}`;
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  return t.fetch(path, { method: "POST", headers: { "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": await sign(id, ts, body, opts.secret) }, body });
}
const asUser = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId}|s1`, issuer: "https://test.local", tokenIdentifier: `https://test.local|${userId}|s1` });
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { data?: { code?: string } }).data?.code ?? `ERR:${String(e).slice(0, 60)}`;
  }
};

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: "stefan@core829.net", addedAt: Date.now() }));
  const mk = (email: string) => t.run((ctx) => ctx.db.insert("users", { email, emailVerificationTime: Date.now() }));
  return { t, admin: asUser(t, await mk("stefan@core829.net")), stranger: asUser(t, await mk("altro@esempio.it")) };
}

const contact = (extra: Record<string, unknown> = {}) => ({ name: "Anna Verdi", email: "Anna@Azienda.it", company: "Azienda Srl", service: "software", budget: "5-10k", message: "Vorremmo un gestionale.", locale: "it", ...extra });

beforeEach(() => {
  process.env.SITE_BRIDGE_SECRET = SECRET;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.SITE_BRIDGE_SECRET;
});

describe("endpoint firmati del sito core829.net", () => {
  it("il modulo contatti arriva nel portale; lo stesso invio ripetuto non crea doppioni", async () => {
    const { t } = await setup();
    const r = await post(t, "/site/contact", contact(), { id: "evt_1" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, status: "created" });
    expect(await (await post(t, "/site/contact", contact(), { id: "evt_1" })).json()).toEqual({ ok: true, status: "duplicate" });
    const rows = await t.run((ctx) => ctx.db.query("siteMessages").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Anna Verdi", email: "anna@azienda.it", company: "Azienda Srl", status: "new", locale: "it" });
  });

  it("rifiuta senza firma, con firma sbagliata, vecchia, corpo troppo grande o dati non validi; non dice quale controllo e' fallito", async () => {
    const { t } = await setup();
    expect((await t.fetch("/site/contact", { method: "POST", body: JSON.stringify(contact()) })).status).toBe(401);
    expect((await post(t, "/site/contact", contact(), { secret: "whsec_" + btoa("altro-segreto-altro-segreto-1234") })).status).toBe(401);
    expect((await post(t, "/site/contact", contact(), { ts: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(401);
    expect((await post(t, "/site/contact", contact({ message: "x".repeat(20_000) }))).status).toBe(413);
    expect((await post(t, "/site/contact", contact({ email: "non-una-email" }))).status).toBe(400);
    expect((await post(t, "/site/contact", { name: "A" })).status).toBe(400);
    expect((await post(t, "/site/contact", null, { raw: "[1,2]" })).status).toBe(400);
    delete process.env.SITE_BRIDGE_SECRET;
    expect((await post(t, "/site/contact", contact())).status).toBe(503);
    expect(await t.run((ctx) => ctx.db.query("siteMessages").collect())).toHaveLength(0);
  });

  it("il testo del messaggio e' conservato come testo (nessun HTML eseguito) e ripulito dai caratteri di controllo", async () => {
    const { t } = await setup();
    await post(t, "/site/contact", contact({ message: "Ciao <script>alert(1)</script>\u0000 fine" }));
    const [m] = await t.run((ctx) => ctx.db.query("siteMessages").collect());
    expect(m.message).not.toContain("\u0000");
    expect(m.message).toContain("<script>"); // resta testo: la pagina admin lo mostra sempre con l'escape
  });

  it("le visite sono solo contatori per giorno, pagina e lingua; percorsi strani sono scartati", async () => {
    const { t } = await setup();
    for (const path of ["/it/prezzi", "/it/prezzi", "/en/prezzi", "/it"]) expect((await post(t, "/site/event", { path })).status).toBe(200);
    for (const bad of ["/xx/prezzi", "https://evil.example", "/it/../../etc", "/it/<script>", "", "x".repeat(200)]) expect((await post(t, "/site/event", { path: bad })).status).toBe(400);
    const stats = await t.run((ctx) => ctx.db.query("siteStats").collect());
    expect(stats.map((s) => `${s.locale}${s.path}:${s.views}`).sort()).toEqual(["en/prezzi:1", "it/:1", "it/prezzi:2"]);
    expect(JSON.stringify(stats)).not.toMatch(/ip|agent|email/i);
    expect((await t.fetch("/site/event", { method: "POST", body: JSON.stringify({ path: "/it" }) })).status).toBe(401);
  });

  it("la configurazione pubblica contiene solo SEO e avviso, senza dati di clienti o messaggi", async () => {
    const { t, admin } = await setup();
    await post(t, "/site/contact", contact());
    await admin.mutation(api.site.seoSave, { page: "prezzi", locale: "it", title: "Prezzi chiari", description: "Piani e costi.", noindex: false });
    await admin.mutation(api.site.announcementSave, { enabled: true, text: "Nuovo servizio AI", href: "/it/ai-per-aziende", cta: "Scopri" });
    const res = await t.fetch("/site/config", { method: "GET" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/s-maxage/);
    const body = await res.json();
    expect(body).toEqual({ seo: [{ page: "prezzi", locale: "it", title: "Prezzi chiari", description: "Piani e costi.", noindex: false }], announcement: { text: "Nuovo servizio AI", href: "/it/ai-per-aziende", cta: "Scopri" } });
    expect(JSON.stringify(body)).not.toMatch(/anna|azienda|gestionale/i);
  });
});

describe("area amministratore del sito", () => {
  it("solo l'amministratore legge e scrive", async () => {
    const { t, admin, stranger } = await setup();
    await post(t, "/site/contact", contact());
    const [{ _id }] = await t.run((ctx) => ctx.db.query("siteMessages").collect());
    const calls: Record<string, (c: typeof admin) => Promise<unknown>> = {
      overview: (c) => c.query(api.site.overview, {}),
      messages: (c) => c.query(api.site.messages, {}),
      setMessageStatus: (c) => c.mutation(api.site.setMessageStatus, { messageId: _id, status: "handled" }),
      removeMessage: (c) => c.mutation(api.site.removeMessage, { messageId: _id }),
      messageToClient: (c) => c.mutation(api.site.messageToClient, { messageId: _id }),
      seoList: (c) => c.query(api.site.seoList, {}),
      seoSave: (c) => c.mutation(api.site.seoSave, { page: "home", locale: "it", title: "X" }),
      announcementGet: (c) => c.query(api.site.announcementGet, {}),
      announcementSave: (c) => c.mutation(api.site.announcementSave, { enabled: false, text: "", href: "", cta: "" }),
    };
    for (const [name, call] of Object.entries(calls)) {
      expect(await code(call(t as unknown as typeof admin)), `${name} anonimo`).toBe("UNAUTHENTICATED");
      expect(await code(call(stranger)), `${name} non admin`).toBe("FORBIDDEN");
    }
    expect(await t.run((ctx) => ctx.db.query("siteMessages").collect())).toHaveLength(1);
  });

  it("messaggi: filtro per stato, stato gestito, eliminazione registrata", async () => {
    const { t, admin } = await setup();
    await post(t, "/site/contact", contact({ name: "Uno Uno" }));
    await post(t, "/site/contact", contact({ name: "Due Due" }));
    const all = await admin.query(api.site.messages, {});
    expect(all).toHaveLength(2);
    await admin.mutation(api.site.setMessageStatus, { messageId: all[0].id, status: "spam" });
    expect(await admin.query(api.site.messages, { status: "new" })).toHaveLength(1);
    expect(await admin.query(api.site.messages, { status: "spam" })).toHaveLength(1);
    await admin.mutation(api.site.removeMessage, { messageId: all[1].id });
    expect(await admin.query(api.site.messages, {})).toHaveLength(1);
    const log = await t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["site.message_received", "site.message_status", "site.message_deleted"]));
  });

  it("dalla richiesta al cliente: crea la scheda con le note, non duplica se l'email esiste gia'", async () => {
    const { t, admin } = await setup();
    await post(t, "/site/contact", contact());
    const [m] = await admin.query(api.site.messages, {});
    const clientId = await admin.mutation(api.site.messageToClient, { messageId: m.id });
    const client = (await t.run((ctx) => ctx.db.get("clients", clientId)))!;
    expect(client).toMatchObject({ displayName: "Azienda Srl", contactName: "Anna Verdi", email: "anna@azienda.it", status: "onboarding" });
    expect(client.internalNotes).toContain("gestionale");
    expect(await admin.mutation(api.site.messageToClient, { messageId: m.id })).toBe(clientId); // ripetuto: stesso cliente
    expect((await admin.query(api.site.messages, {}))[0]).toMatchObject({ status: "handled", clientId });
    // Altra richiesta con la stessa email: si riusa il cliente esistente.
    await post(t, "/site/contact", contact({ message: "Seconda richiesta" }));
    const second = (await admin.query(api.site.messages, { status: "new" }))[0];
    expect(await admin.mutation(api.site.messageToClient, { messageId: second.id })).toBe(clientId);
    expect(await t.run((ctx) => ctx.db.query("clients").collect())).toHaveLength(1);
  });

  it("SEO: salva per pagina e lingua, solo pagine e lingue del sito; tutto vuoto = torna al testo predefinito", async () => {
    const { t, admin } = await setup();
    await admin.mutation(api.site.seoSave, { page: "home", locale: "*", title: "CORE829 — software e AI", description: "Descrizione." });
    await admin.mutation(api.site.seoSave, { page: "home", locale: "en", title: "CORE829 — software and AI" });
    expect((await admin.query(api.site.seoList, {})).map((s) => `${s.page}/${s.locale}`).sort()).toEqual(["home/*", "home/en"]);
    for (const bad of [{ page: "admin", locale: "it" }, { page: "home", locale: "xx" }]) expect(await code(admin.mutation(api.site.seoSave, { ...bad, title: "X" }))).not.toBe("OK");
    expect(await code(admin.mutation(api.site.seoSave, { page: "home", locale: "it", title: "x".repeat(500) }))).not.toBe("OK");
    await admin.mutation(api.site.seoSave, { page: "home", locale: "en", title: "", description: "" });
    expect(await t.run((ctx) => ctx.db.query("siteSeo").collect())).toHaveLength(1);
  });

  it("avviso in testata: attivo solo con un testo; indirizzi pericolosi rifiutati", async () => {
    const { admin } = await setup();
    expect(await code(admin.mutation(api.site.announcementSave, { enabled: true, text: "", href: "", cta: "" }))).not.toBe("OK");
    // eslint-disable-next-line no-script-url -- prova: un indirizzo javascript: deve essere rifiutato
    for (const href of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "http://non-sicuro.it", "/it/<x>"]) {
      expect(await code(admin.mutation(api.site.announcementSave, { enabled: true, text: "Ciao", href, cta: "Vai" })), href).not.toBe("OK");
    }
    await admin.mutation(api.site.announcementSave, { enabled: true, text: "Chiusi il 24 dicembre", href: "https://core829.net/it/contatti", cta: "Contatti" });
    expect(await admin.query(api.site.announcementGet, {})).toMatchObject({ enabled: true, text: "Chiusi il 24 dicembre" });
  });

  it("panoramica: visite per giorno/pagina/lingua, messaggi nuovi", async () => {
    const { t, admin } = await setup();
    for (const path of ["/it/prezzi", "/it/prezzi", "/en"]) await post(t, "/site/event", { path });
    await post(t, "/site/contact", contact());
    const o = await admin.query(api.site.overview, { days: 7 });
    expect(o.views).toBe(3);
    expect(o.series).toHaveLength(7);
    expect(o.series[6]).toEqual({ day: "2026-11-15", value: 3 });
    expect(o.topPaths[0]).toEqual({ label: "/prezzi", value: 2 });
    expect(o.topLocales[0]).toEqual({ label: "it", value: 2 });
    expect(o.newMessages).toBe(1);
  });
});

describe("risposte alle richieste del sito (email da clients@core829.net)", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_x";
    delete process.env.CLIENTS_EMAIL_FROM;
  });
  const fetchOk = () => {
    const f = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    return f;
  };

  it("parte da clients@core829.net, risponde a hello@, avvisa di scrivere all'indirizzo ufficiale e tiene una copia nascosta", async () => {
    const { t, admin } = await setup();
    await post(t, "/site/contact", contact());
    const f = fetchOk();
    const [m] = await admin.query(api.site.messages, {});
    await admin.mutation(api.site.reply, { messageId: m.id, subject: "Re: la tua richiesta", body: "Buongiorno Anna,\n\nci sentiamo domani.\n\nCORE829" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(f).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String(f.mock.calls[0][1].body)) as Record<string, unknown>;
    expect(sent.from).toBe("CORE829 <clients@core829.net>");
    expect(sent.to).toEqual(["anna@azienda.it"]);
    expect(sent.reply_to).toBe("hello@core829.net");
    expect(sent.bcc).toEqual(["hello@core829.net"]);
    expect(String(sent.text)).toContain("ci sentiamo domani");
    expect(String(sent.text)).toContain("(clients@core829.net) che non viene letto");
    expect(String(sent.text)).toContain("scrivi a hello@core829.net");
    expect(String(sent.html)).toContain("footer di core829.net");
    const [reply] = await admin.query(api.site.repliesFor, { messageId: m.id });
    expect(reply).toMatchObject({ status: "sent", subject: "Re: la tua richiesta" });
    expect((await admin.query(api.site.messages, {}))[0].status).toBe("handled");
  });

  it("il mittente si puo' cambiare con CLIENTS_EMAIL_FROM; il testo del messaggio non diventa mai HTML", async () => {
    const { t, admin } = await setup();
    await post(t, "/site/contact", contact());
    process.env.CLIENTS_EMAIL_FROM = "CORE829 Clienti <clienti@core829.net>";
    const f = fetchOk();
    const [m] = await admin.query(api.site.messages, {});
    await admin.mutation(api.site.reply, { messageId: m.id, subject: "Ciao", body: "<script>alert(1)</script> e <b>grassetto</b>" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const sent = JSON.parse(String(f.mock.calls[0][1].body)) as { from: string; html: string };
    expect(sent.from).toBe("CORE829 Clienti <clienti@core829.net>");
    expect(sent.html).not.toContain("<script>");
    expect(sent.html).toContain("&lt;script&gt;");
  });

  it("se l'invio fallisce la risposta e' segnata «non inviata» e si puo' riprovare; senza chiave email non parte nulla", async () => {
    const { t, admin } = await setup();
    await post(t, "/site/contact", contact());
    const [m] = await admin.query(api.site.messages, {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    const id = await admin.mutation(api.site.reply, { messageId: m.id, subject: "Ciao", body: "Testo della risposta" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await admin.query(api.site.repliesFor, { messageId: m.id }))[0].status).toBe("failed");
    const f = fetchOk();
    await admin.mutation(api.site.retryReply, { replyId: id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(f).toHaveBeenCalledTimes(1);
    expect((await admin.query(api.site.repliesFor, { messageId: m.id }))[0].status).toBe("sent");
    expect(await code(admin.mutation(api.site.retryReply, { replyId: id }))).toBe("BAD_STATE"); // gia' inviata: non si rinvia
    delete process.env.RESEND_API_KEY;
    const id2 = await admin.mutation(api.site.reply, { messageId: m.id, subject: "Altro", body: "Secondo messaggio" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.get("siteReplies", id2)))!.status).toBe("failed");
  });

  it("solo l'amministratore risponde; oggetto e testo validi", async () => {
    const { t, admin, stranger } = await setup();
    await post(t, "/site/contact", contact());
    const [m] = await admin.query(api.site.messages, {});
    const f = fetchOk();
    expect(await code(stranger.mutation(api.site.reply, { messageId: m.id, subject: "Ciao", body: "Testo valido" }))).toBe("FORBIDDEN");
    expect(await code(t.mutation(api.site.reply, { messageId: m.id, subject: "Ciao", body: "Testo valido" }))).toBe("UNAUTHENTICATED");
    expect(await code(stranger.query(api.site.repliesFor, { messageId: m.id }))).toBe("FORBIDDEN");
    expect(await code(admin.mutation(api.site.reply, { messageId: m.id, subject: "", body: "Testo valido" }))).not.toBe("OK");
    expect(await code(admin.mutation(api.site.reply, { messageId: m.id, subject: "Ciao", body: "x" }))).not.toBe("OK");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("regole pure", () => {
  it("percorsi tracciati", () => {
    expect(parseTrackedPath("/it/servizi/web")).toEqual({ locale: "it", path: "/servizi/web" });
    expect(parseTrackedPath("/en")).toEqual({ locale: "en", path: "/" });
    expect(parseTrackedPath("/it/a/b/c/d/e")).toEqual({ locale: "it", path: "/a/b/c" });
    expect(parseTrackedPath("/zz/x")).toBeNull();
  });
  it("avviso: normalizza e valida", () => {
    expect(cleanAnnouncement({ enabled: false, text: "  ", href: "", cta: "" })).toEqual({ enabled: false, text: "", href: "", cta: "" });
  });
});
