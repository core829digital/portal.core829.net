/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const SECRET = "whsec_" + btoa("0123456789abcdef0123456789abcdef");

async function sign(id: string, ts: number, body: string, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  return "v1," + btoa(String.fromCharCode(...mac));
}

const deal = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    dealId: "D-2026-014",
    client: { displayName: "Caffè Rosso Srl", contactName: "Mario Rossi", email: "Mario@Caffe.it", phone: "+39 333 1112223", vatId: "IT01234567890", packageType: "advanced" },
    notes: "Vuole sito + manutenzione annuale.",
    salesAgent: "Giulia",
    ...extra,
  });

async function post(t: ReturnType<typeof convexTest>, body: string, opts: { id?: string; ts?: number; secret?: string; headers?: Record<string, string> } = {}) {
  const id = opts.id ?? "msg_1";
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const headers = opts.headers ?? { "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": await sign(id, ts, body, opts.secret) };
  return t.fetch("/integrations/b2b/deals", { method: "POST", headers, body });
}

beforeEach(() => {
  process.env.B2B_WEBHOOK_SECRET = SECRET;
  process.env.RESEND_API_KEY = "re_chiave_di_prova";
  process.env.AUTH_EMAIL_FROM = "CORE829 <portal@core829.net>";
  process.env.ADMIN_EMAILS = "stefan@core829.net";
  process.env.SITE_URL = "https://portal.core829.net";
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ["B2B_WEBHOOK_SECRET", "RESEND_API_KEY", "AUTH_EMAIL_FROM", "ADMIN_EMAILS", "SITE_URL"]) delete process.env[k];
});

const clients = (t: ReturnType<typeof convexTest>) => t.run((ctx) => ctx.db.query("clients").collect());

describe("endpoint trattative da b2b.core829.net", () => {
  it("con la firma giusta crea il cliente in stato 'In avvio' e avvisa gli amministratori", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const res = await post(t, deal());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "created" });

    const [client] = await clients(t);
    expect(client).toMatchObject({ displayName: "Caffè Rosso Srl", email: "mario@caffe.it", status: "onboarding", packageType: "advanced", vatId: "IT01234567890" });
    expect(client.internalNotes).toContain("trattativa D-2026-014");
    expect(client.internalNotes).toContain("agente Giulia");
    expect(client.internalNotes).toContain("sito + manutenzione");
    const log = await t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(log.some((l) => l.action === "b2b.deal_received" && l.metadata?.created === true)).toBe(true);

    await new Promise((r) => setTimeout(r, 20));
    await t.finishInProgressScheduledFunctions();
    const mail = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(mail.to).toEqual(["stefan@core829.net"]);
    expect(mail.html).toContain(`https://portal.core829.net/admin/clients/${client._id}/contracts`);
  });

  it("lo stesso messaggio ripetuto (replay) non crea nulla di nuovo; un'altra trattativa per la stessa email usa il cliente esistente", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const t = convexTest(schema, modules);
    const body = deal();
    expect(await (await post(t, body, { id: "msg_1" })).json()).toMatchObject({ status: "created" });
    expect(await (await post(t, body, { id: "msg_1" })).json()).toMatchObject({ status: "duplicate" });
    expect(await (await post(t, deal({ dealId: "D-2026-015" }), { id: "msg_2" })).json()).toMatchObject({ status: "exists" });
    expect(await clients(t)).toHaveLength(1);
  });

  it("rifiuta senza firma, con firma sbagliata, con segreto diverso, con corpo cambiato e con timestamp vecchio", async () => {
    const t = convexTest(schema, modules);
    const body = deal();
    const ts = Math.floor(Date.now() / 1000);
    const attempts = [
      await post(t, body, { headers: {} }),
      await post(t, body, { headers: { "webhook-id": "m", "webhook-timestamp": String(ts), "webhook-signature": "v1,AAAA" } }),
      await post(t, body, { secret: "whsec_" + btoa("un-altro-segreto-un-altro-segreto") }),
      await t.fetch("/integrations/b2b/deals", { method: "POST", headers: { "webhook-id": "m", "webhook-timestamp": String(ts), "webhook-signature": await sign("m", ts, body) }, body: deal({ dealId: "ALTRO" }) }),
      await post(t, body, { ts: ts - 3600 }),
    ];
    for (const r of attempts) {
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ error: "unauthorized" });
    }
    expect(await clients(t)).toHaveLength(0);
  });

  it("senza segreto configurato rifiuta tutto", async () => {
    delete process.env.B2B_WEBHOOK_SECRET;
    const t = convexTest(schema, modules);
    expect((await post(t, deal())).status).toBe(503);
    expect(await clients(t)).toHaveLength(0);
  });

  it("dati non validi o incompleti: 400 generico, nulla viene creato", async () => {
    const t = convexTest(schema, modules);
    for (const [i, body] of [
      "non json",
      JSON.stringify({ dealId: "x" }),
      deal({ client: { displayName: "A", contactName: "B", email: "non-una-email" } }),
      deal({ client: { displayName: "A", contactName: "B", email: "a@b.it", vatId: "!!!" } }),
    ].entries()) {
      const res = await post(t, body, { id: `bad_${i}` });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "bad_request" });
    }
    expect(await clients(t)).toHaveLength(0);
  });

  it("corpo troppo grande: 413", async () => {
    const t = convexTest(schema, modules);
    expect((await post(t, deal({ notes: "x".repeat(20_000) }))).status).toBe(413);
  });

  it("il testo scritto dal B2B e' solo testo (nessun HTML nell'email agli amministratori)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    await post(t, deal({ dealId: "<img src=x onerror=alert(1)>" }));
    await new Promise((r) => setTimeout(r, 20));
    await t.finishInProgressScheduledFunctions();
    const mail = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img");
  });
});
