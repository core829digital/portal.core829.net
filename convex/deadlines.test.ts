/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

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

const DAY = 86_400_000;

describe("scadenziario", () => {
  it("riunisce fatture, rinnovi, firme e scadenze manuali in ordine di data; esclude pagate, concluse, annullate e scadute", async () => {
    const h = await track();
    const { t, admin, clientA } = h;
    await t.run(async (ctx) => {
      const base = { clientId: clientA, issuedAt: NOW, amountCents: 10_000, currency: "EUR" as const, visibleToClient: true };
      await ctx.db.insert("invoices", { ...base, number: "A-1", dueAt: NOW + 10 * DAY, status: "sent" });
      await ctx.db.insert("invoices", { ...base, number: "A-2", dueAt: NOW - 3 * DAY, status: "overdue" });
      await ctx.db.insert("invoices", { ...base, number: "A-3", dueAt: NOW + 5 * DAY, status: "paid" });
      await ctx.db.insert("invoices", { ...base, number: "A-4", dueAt: NOW + 5 * DAY, status: "draft" });
      await ctx.db.insert("subscriptions", { clientId: clientA, name: "Hosting", amountCents: 2_000, currency: "EUR", interval: "month", status: "active", startedAt: NOW - 30 * DAY, nextRenewalAt: NOW + 20 * DAY });
      await ctx.db.insert("subscriptions", { clientId: clientA, name: "Annullato", amountCents: 2_000, currency: "EUR", interval: "month", status: "cancelled", startedAt: NOW - 30 * DAY, nextRenewalAt: NOW + 2 * DAY });
    });
    await admin.mutation(api.deadlines.create, { title: "Dominio azienda.it", dueAt: NOW + 15 * DAY, clientId: clientA, category: "domain" });
    const doneId = await admin.mutation(api.deadlines.create, { title: "Già fatto", dueAt: NOW + 1 * DAY, category: "other" });
    await admin.mutation(api.deadlines.setDone, { deadlineId: doneId, done: true });
    await admin.mutation(api.deadlines.create, { title: "Fuori orizzonte", dueAt: NOW + 400 * DAY, category: "other" });
    const items = await admin.query(api.deadlines.overview, { nowMs: NOW });
    expect(items.map((i) => i.title)).toEqual(["Fattura A-2", "Fattura A-1", "Dominio azienda.it", "Rinnovo: Hosting"]);
    expect(items[0]).toMatchObject({ kind: "invoice", clientName: "Cliente a", amountCents: 10_000 });
    expect(items[2]).toMatchObject({ kind: "manual", category: "domain" });
  });

  it("tiene conto delle firme in attesa non ancora scadute", async () => {
    const h = await track();
    await h.t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["x"]));
      const documentId = await ctx.db.insert("documents", { clientId: h.clientA, kind: "contract", title: "Contratto", storageId, fileName: "c.pdf", mimeType: "application/pdf", sizeBytes: 1, scanStatus: "clean", visibleToClient: true });
      await ctx.db.insert("signatureRequests", { clientId: h.clientA, documentId, status: "pending", signerEmail: "a@esempio.it", createdAt: NOW, expiresAt: NOW + 6 * DAY, docSha256: "x" });
      await ctx.db.insert("signatureRequests", { clientId: h.clientA, documentId, status: "pending", signerEmail: "a@esempio.it", createdAt: NOW - 20 * DAY, expiresAt: NOW - 2 * DAY, docSha256: "x" });
    });
    const items = await h.admin.query(api.deadlines.overview, { nowMs: NOW });
    expect(items.filter((i) => i.kind === "signature")).toHaveLength(1);
  });

  it("solo gli amministratori; titolo e data validati; un cliente inesistente è rifiutato", async () => {
    const h = await track();
    for (const who of [h.stranger, h.t] as (typeof h.t)[]) {
      expect(await msg(who.query(api.deadlines.overview, { nowMs: NOW }))).not.toBe("OK");
      expect(await msg(who.mutation(api.deadlines.create, { title: "x", dueAt: NOW, category: "other" }))).not.toBe("OK");
    }
    expect(await msg(h.admin.mutation(api.deadlines.create, { title: "a", dueAt: NOW + DAY, category: "other" }))).toMatch(/VALIDATION/);
    expect(await msg(h.admin.mutation(api.deadlines.create, { title: "Ok ok", dueAt: Number.NaN, category: "other" }))).not.toBe("OK");
  });

  it("promemoria: la fattura che scade entro 3 giorni avvisa il cliente UNA volta; non quelle nascoste, pagate o lontane", async () => {
    const h = await track();
    const { t, clientA } = h;
    await t.run(async (ctx) => {
      const base = { clientId: clientA, issuedAt: NOW, amountCents: 5_000, currency: "EUR" as const };
      await ctx.db.insert("invoices", { ...base, number: "S-1", dueAt: NOW + 2 * DAY, status: "sent", visibleToClient: true });
      await ctx.db.insert("invoices", { ...base, number: "S-2", dueAt: NOW + 2 * DAY, status: "sent", visibleToClient: false });
      await ctx.db.insert("invoices", { ...base, number: "S-3", dueAt: NOW + 2 * DAY, status: "paid", visibleToClient: true });
      await ctx.db.insert("invoices", { ...base, number: "S-4", dueAt: NOW + 20 * DAY, status: "sent", visibleToClient: true });
    });
    expect(await t.mutation(internal.deadlines.sendReminders, {})).toEqual({ invoices: 1, deadlines: 0 });
    expect(await t.mutation(internal.deadlines.sendReminders, {})).toEqual({ invoices: 0, deadlines: 0 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const mails = sent();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toEqual(["a@esempio.it"]);
    expect(mails[0].subject).toContain("S-1");
  });

  it("promemoria alla amministrazione per le scadenze manuali entro 7 giorni (una volta); le concluse no", async () => {
    const h = await track();
    await h.admin.mutation(api.deadlines.create, { title: "Dominio azienda.it", dueAt: NOW + 5 * DAY, clientId: h.clientA, category: "domain", notes: "Rinnovare su Aruba" });
    const done = await h.admin.mutation(api.deadlines.create, { title: "Fatto", dueAt: NOW + 2 * DAY, category: "other" });
    await h.admin.mutation(api.deadlines.setDone, { deadlineId: done, done: true });
    await h.admin.mutation(api.deadlines.create, { title: "Lontana", dueAt: NOW + 60 * DAY, category: "other" });
    expect(await h.t.mutation(internal.deadlines.sendReminders, {})).toEqual({ invoices: 0, deadlines: 1 });
    expect(await h.t.mutation(internal.deadlines.sendReminders, {})).toEqual({ invoices: 0, deadlines: 0 });
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    const m = sent();
    expect(m).toHaveLength(1);
    expect(m[0].to).toEqual(["stefan@core829.net"]);
    expect(m[0].text).toContain("Rinnovare su Aruba");
  });

  it("si può riaprire e cancellare una scadenza manuale", async () => {
    const h = await track();
    const id = await h.admin.mutation(api.deadlines.create, { title: "Contratto hosting", dueAt: NOW + DAY, category: "contract" });
    await h.admin.mutation(api.deadlines.setDone, { deadlineId: id, done: true });
    expect(await h.admin.query(api.deadlines.overview, { nowMs: NOW })).toHaveLength(0);
    await h.admin.mutation(api.deadlines.setDone, { deadlineId: id, done: false });
    expect(await h.admin.query(api.deadlines.overview, { nowMs: NOW })).toHaveLength(1);
    await h.admin.mutation(api.deadlines.remove, { deadlineId: id });
    expect(await h.admin.query(api.deadlines.overview, { nowMs: NOW })).toHaveLength(0);
  });
});
