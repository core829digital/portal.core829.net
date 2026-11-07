import { describe, expect, it } from "vitest";
import { verifyWebhook } from "./webhookSignature";

// Vettore generato con un'implementazione INDIPENDENTE (node:crypto) dello standard: il codice sotto test
// non si confronta con se stesso.
const V = {
  secret: "whsec_Y2hpYXZlLWRpLXByb3ZhLXBlci1pLXRlc3QtMDEyMzQ1Njc4OQ==",
  id: "msg_test_0001",
  ts: 1800000000,
  body: '{"type":"email.bounced","created_at":"2026-11-07T10:00:00.000Z","data":{"email_id":"e1","to":["Cliente@Esempio.it"]}}',
  sig: "v1,pwmF1fVCpS3moJbzNxqMzh7KDPWW88pRsOwFf5gP1H0=",
};
const NOW = V.ts * 1000;

const headers = (h: Record<string, string>) => ({ get: (name: string) => h[name.toLowerCase()] ?? null });
const good = () => headers({ "webhook-id": V.id, "webhook-timestamp": String(V.ts), "webhook-signature": V.sig });

// Firma indipendente (Web Crypto) per costruire casi diversi dal vettore.
async function sign(secret: string, id: string, ts: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  return "v1," + btoa(String.fromCharCode(...new Uint8Array(mac)));
}

describe("verifyWebhook", () => {
  it("accetta il vettore di prova", async () => {
    expect(await verifyWebhook({ secret: V.secret, headers: good(), body: V.body, nowMs: NOW })).toEqual({ ok: true, id: V.id });
  });

  it("accetta anche gli alias svix-*", async () => {
    const h = headers({ "svix-id": V.id, "svix-timestamp": String(V.ts), "svix-signature": V.sig });
    expect((await verifyWebhook({ secret: V.secret, headers: h, body: V.body, nowMs: NOW })).ok).toBe(true);
  });

  it("rifiuta il corpo modificato anche di un solo carattere", async () => {
    for (const body of [V.body + " ", V.body.replace("bounced", "bouncee"), "", V.body.replace("Cliente", "Intruso")]) {
      expect((await verifyWebhook({ secret: V.secret, headers: good(), body, nowMs: NOW })).ok, body.slice(-20)).toBe(false);
    }
  });

  it("rifiuta un segreto diverso, id o timestamp alterati", async () => {
    const other = "whsec_" + btoa("un-altro-segreto-completamente-diverso");
    expect((await verifyWebhook({ secret: other, headers: good(), body: V.body, nowMs: NOW })).ok).toBe(false);
    const wrongId = headers({ "webhook-id": "msg_altro", "webhook-timestamp": String(V.ts), "webhook-signature": V.sig });
    expect((await verifyWebhook({ secret: V.secret, headers: wrongId, body: V.body, nowMs: NOW })).ok).toBe(false);
    const wrongTs = headers({ "webhook-id": V.id, "webhook-timestamp": String(V.ts + 1), "webhook-signature": V.sig });
    expect((await verifyWebhook({ secret: V.secret, headers: wrongTs, body: V.body, nowMs: NOW + 1000 })).ok).toBe(false);
  });

  it("anti replay: il timestamp deve essere entro 5 minuti, nel passato e nel futuro", async () => {
    const run = (nowMs: number) => verifyWebhook({ secret: V.secret, headers: good(), body: V.body, nowMs });
    expect((await run(NOW + 299_000)).ok).toBe(true);
    expect((await run(NOW + 301_000)).ok).toBe(false); // messaggio troppo vecchio
    expect((await run(NOW - 299_000)).ok).toBe(true);
    expect((await run(NOW - 301_000)).ok).toBe(false); // messaggio dal futuro
  });

  it("intestazioni mancanti, vuote o con forma strana", async () => {
    const base = { "webhook-id": V.id, "webhook-timestamp": String(V.ts), "webhook-signature": V.sig };
    for (const drop of Object.keys(base)) {
      const h = { ...base } as Record<string, string>;
      delete h[drop];
      expect((await verifyWebhook({ secret: V.secret, headers: headers(h), body: V.body, nowMs: NOW })).ok, drop).toBe(false);
    }
    for (const bad of [{ "webhook-timestamp": "abc" }, { "webhook-timestamp": "-5" }, { "webhook-timestamp": "1.8e9" }, { "webhook-id": "id con spazi" }, { "webhook-id": "x".repeat(200) }, { "webhook-signature": "" }, { "webhook-signature": "v2," + V.sig.slice(3) }, { "webhook-signature": "v1,non-base64!!" }, { "webhook-signature": V.sig.slice(3) }]) {
      expect((await verifyWebhook({ secret: V.secret, headers: headers({ ...base, ...bad }), body: V.body, nowMs: NOW })).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("con piu' firme basta che una sia valida (rotazione del segreto)", async () => {
    const h = headers({ "webhook-id": V.id, "webhook-timestamp": String(V.ts), "webhook-signature": `v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ${V.sig}` });
    expect((await verifyWebhook({ secret: V.secret, headers: h, body: V.body, nowMs: NOW })).ok).toBe(true);
  });

  it("segreto vuoto o non valido: nessun messaggio e' accettato", async () => {
    for (const secret of ["", "whsec_", "whsec_!!!non-base64", "   "]) {
      expect((await verifyWebhook({ secret, headers: good(), body: V.body, nowMs: NOW })).ok, secret).toBe(false);
    }
  });

  it("firma costruita da zero (Web Crypto) coincide con quella accettata", async () => {
    const body = '{"type":"email.delivered"}';
    const h = headers({ "webhook-id": "msg_9", "webhook-timestamp": String(V.ts), "webhook-signature": await sign(V.secret, "msg_9", V.ts, body) });
    expect((await verifyWebhook({ secret: V.secret, headers: h, body, nowMs: NOW })).ok).toBe(true);
  });
});
