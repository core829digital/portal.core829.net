/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { APPROVAL_TTL_MS } from "./approvals";

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
  const addDoc = (clientId: Id<"clients">, over: { scan?: "clean" | "pending"; visible?: boolean } = {}) =>
    t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["x"], { type: "application/pdf" }));
      return ctx.db.insert("documents", { clientId, kind: "quote", title: "Preventivo sito", storageId, fileName: "p.pdf", mimeType: "application/pdf", sizeBytes: 1, scanStatus: over.scan ?? "clean", visibleToClient: over.visible ?? false });
    });
  return { t, admin, stranger, clientA, clientB, unlock, addDoc };
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

const decide = (s: { token: string; unlockToken: string }, requestId: Id<"approvalRequests">, over: Record<string, unknown> = {}) => ({ ...s, requestId, decision: "approve" as const, fullName: "Mario Rossi", ...over });

describe("approvazioni", () => {
  it("l'amministrazione chiede, il cliente riceve l'email e vede la richiesta; il documento diventa visibile", async () => {
    const h = await track();
    const s = await h.unlock(h.clientA);
    const doc = await h.addDoc(h.clientA);
    const id = await h.admin.mutation(api.approvals.request, { documentId: doc, message: "Ti chiediamo l'ok entro fine mese." });
    expect((await h.t.run((ctx) => ctx.db.get("documents", doc)))?.visibleToClient).toBe(true);
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    const toClient = sent().filter((m) => m.to.includes("a@esempio.it"));
    expect(toClient).toHaveLength(1);
    expect(toClient[0].subject).toBe("Da approvare: Preventivo sito");
    expect(toClient[0].text).toContain("fine mese");
    const mine = await h.t.query(api.approvals.forClient, { ...s, nowMs: NOW });
    expect(mine).toEqual([expect.objectContaining({ id, documentId: doc, status: "pending", message: "Ti chiediamo l'ok entro fine mese." })]);
  });

  it("il cliente approva: stato, nome e data registrati, email a noi, decisione definitiva", async () => {
    const h = await track();
    const s = await h.unlock(h.clientA);
    const id = await h.admin.mutation(api.approvals.request, { documentId: await h.addDoc(h.clientA) });
    await h.t.mutation(api.approvals.decide, decide(s, id, { comment: "Perfetto, procedete." }));
    const [row] = await h.admin.query(api.approvals.list, { nowMs: NOW });
    expect(row).toMatchObject({ status: "approved", decidedName: "Mario Rossi", comment: "Perfetto, procedete.", clientName: "Cliente a" });
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    const toAdmin = sent().filter((m) => m.to.includes("stefan@core829.net"));
    expect(toAdmin.map((m) => m.subject)).toEqual(["Cliente a ha approvato: Preventivo sito"]);
    expect(await msg(h.t.mutation(api.approvals.decide, decide(s, id, { decision: "changes", comment: "ci ripenso" })))).toMatch(/BAD_STATE.*già risposto/);
  });

  it("richiesta di modifiche: il commento è obbligatorio e arriva a noi", async () => {
    const h = await track();
    const s = await h.unlock(h.clientA);
    const id = await h.admin.mutation(api.approvals.request, { documentId: await h.addDoc(h.clientA) });
    expect(await msg(h.t.mutation(api.approvals.decide, decide(s, id, { decision: "changes" })))).toMatch(/VALIDATION/);
    await h.t.mutation(api.approvals.decide, decide(s, id, { decision: "changes", comment: "Il prezzo del dominio va tolto." }));
    expect((await h.admin.query(api.approvals.list, { nowMs: NOW }))[0].status).toBe("changes_requested");
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    const m = sent().find((x) => x.to.includes("stefan@core829.net"));
    expect(m?.subject).toContain("chiede modifiche");
    expect(m?.text).toContain("prezzo del dominio");
  });

  it("scaduta o annullata: non si può più decidere; scadenza a 30 giorni", async () => {
    const h = await track();
    const s = await h.unlock(h.clientA);
    const id = await h.admin.mutation(api.approvals.request, { documentId: await h.addDoc(h.clientA) });
    expect((await h.admin.query(api.approvals.list, { nowMs: NOW + APPROVAL_TTL_MS + 1 }))[0].status).toBe("expired");
    vi.setSystemTime(NOW + APPROVAL_TTL_MS + 1000);
    expect(await msg(h.t.mutation(api.approvals.decide, decide(s, id)))).toMatch(/scaduta/);
    vi.setSystemTime(NOW);
    const doc2 = await h.addDoc(h.clientA);
    const id2 = await h.admin.mutation(api.approvals.request, { documentId: doc2 });
    await h.admin.mutation(api.approvals.revoke, { requestId: id2 });
    expect(await msg(h.t.mutation(api.approvals.decide, decide(s, id2)))).toMatch(/annullata/);
    expect(await msg(h.admin.mutation(api.approvals.revoke, { requestId: id2 }))).toMatch(/BAD_STATE/);
  });

  it("sicurezza: un cliente non decide sulle richieste di un altro; serve lo sblocco; solo gli admin richiedono", async () => {
    const h = await track();
    const a = await h.unlock(h.clientA);
    const b = await h.unlock(h.clientB);
    const id = await h.admin.mutation(api.approvals.request, { documentId: await h.addDoc(h.clientA) });
    expect(await msg(h.t.mutation(api.approvals.decide, decide(b, id)))).toMatch(/NOT_FOUND/);
    expect(await h.t.query(api.approvals.forClient, { ...b, nowMs: NOW })).toHaveLength(0);
    expect(await msg(h.t.mutation(api.approvals.decide, decide({ token: a.token, unlockToken: "x".repeat(43) }, id)))).toMatch(/UNLOCK_REQUIRED/);
    const doc = await h.addDoc(h.clientA);
    for (const who of [h.stranger, h.t] as (typeof h.t)[]) {
      expect(await msg(who.mutation(api.approvals.request, { documentId: doc }))).not.toBe("OK");
      expect(await msg(who.query(api.approvals.list, { nowMs: NOW }))).not.toBe("OK");
      expect(await msg(who.mutation(api.approvals.revoke, { requestId: id }))).not.toBe("OK");
    }
  });

  it("regole: niente doppia richiesta in corso; file non controllato rifiutato; nome troppo corto; testo escapato", async () => {
    const h = await track();
    const s = await h.unlock(h.clientA);
    const doc = await h.addDoc(h.clientA);
    const id = await h.admin.mutation(api.approvals.request, { documentId: doc });
    expect(await msg(h.admin.mutation(api.approvals.request, { documentId: doc }))).toMatch(/CONFLICT/);
    expect(await msg(h.admin.mutation(api.approvals.request, { documentId: await h.addDoc(h.clientA, { scan: "pending" }) }))).toMatch(/BAD_STATE/);
    expect(await msg(h.t.mutation(api.approvals.decide, decide(s, id, { fullName: "Al" })))).toMatch(/VALIDATION/);
    await h.t.mutation(api.approvals.decide, decide(s, id, { comment: "<script>alert(1)</script>" }));
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    const html = fetchMock.mock.calls.map((c) => String(JSON.parse(String(c[1].body)).html)).join("");
    expect(html).not.toContain("<script>");
  });
});
