/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.UTC(2026, 10, 15, 10, 0, 0);
const NOV = Date.UTC(2026, 10, 1);
const OCT = Date.UTC(2026, 9, 1);

const asUser = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId}|s1`, issuer: "https://test.local", tokenIdentifier: `https://test.local|${userId}|s1` });

async function setup() {
  const t = convexTest(schema, modules);
  const adminId = await t.run(async (ctx) => {
    await ctx.db.insert("admins", { email: "stefan@core829.net", addedAt: Date.now() });
    return ctx.db.insert("users", { email: "stefan@core829.net", emailVerificationTime: Date.now() });
  });
  const strangerId = await t.run((ctx) => ctx.db.insert("users", { email: "altro@esempio.it", emailVerificationTime: Date.now() }));
  const mk = (n: string) => t.run((ctx) => ctx.db.insert("clients", { displayName: `Cliente ${n}`, contactName: n, email: `${n}@esempio.it`, packageType: "standard", status: "active" }));
  const clientA = await mk("a");
  const clientB = await mk("b");
  return { t, admin: asUser(t, adminId), stranger: asUser(t, strangerId), clientA, clientB };
}

async function unlock(h: Awaited<ReturnType<typeof setup>>, clientId: Id<"clients">) {
  const link = await h.admin.mutation(api.accessLinks.create, { clientId });
  const { code } = await h.t.mutation(internal.otp.issueCode, { linkId: link.linkId });
  const r = await h.t.mutation(api.otp.verifyCode, { token: link.token, code });
  if (!r.ok) throw new Error("sblocco fallito");
  return { token: link.token, unlockToken: r.unlockToken };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { data?: { code?: string } }).data?.code ?? `ERR:${String(e).slice(0, 80)}`;
  }
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("report mensile: area admin", () => {
  it("solo l'amministratore legge e scrive", async () => {
    const h = await setup();
    const calls: Record<string, (c: { query: typeof h.t.query; mutation: typeof h.t.mutation }) => Promise<unknown>> = {
      list: (c) => c.query(api.reports.list, { clientId: h.clientA }),
      get: (c) => c.query(api.reports.get, { clientId: h.clientA, month: NOV }),
      previousKeys: (c) => c.query(api.reports.previousKeys, { clientId: h.clientA, month: NOV }),
      save: (c) => c.mutation(api.reports.save, { clientId: h.clientA, month: NOV, summary: null, nextSteps: null, metrics: [] }),
      setPublished: (c) => c.mutation(api.reports.setPublished, { clientId: h.clientA, month: NOV, published: true }),
      remove: (c) => c.mutation(api.reports.remove, { clientId: h.clientA, month: NOV }),
    };
    for (const [name, call] of Object.entries(calls)) {
      expect(await code(call(h.t)), `${name} anonimo`).toBe("UNAUTHENTICATED");
      expect(await code(call(h.stranger)), `${name} non admin`).toBe("FORBIDDEN");
    }
  });

  it("salva, rilegge, confronta col mese prima e calcola i numeri automatici", async () => {
    const h = await setup();
    await h.admin.mutation(api.reports.save, {
      clientId: h.clientA,
      month: OCT,
      summary: "Ottobre ok",
      nextSteps: null,
      metrics: [{ key: "web.visits", value: 1000 }, { key: "web.bounce", value: 50 }],
    });
    await h.t.run(async (ctx) => {
      await ctx.db.insert("invoices", { clientId: h.clientA, number: "1", issuedAt: NOV + 1000, dueAt: NOV + 99999, amountCents: 50000, currency: "EUR", status: "paid", paidAt: NOV + 5000, visibleToClient: true });
      await ctx.db.insert("invoices", { clientId: h.clientA, number: "2", issuedAt: NOV + 1000, dueAt: NOV + 99999, amountCents: 99900, currency: "EUR", status: "draft", visibleToClient: true });
      await ctx.db.insert("invoices", { clientId: h.clientA, number: "3", issuedAt: NOV + 1000, dueAt: NOV + 99999, amountCents: 77700, currency: "EUR", status: "paid", paidAt: NOV + 6000, visibleToClient: false });
      await ctx.db.insert("subscriptions", { clientId: h.clientA, name: "Hosting", amountCents: 12000, currency: "EUR", interval: "year", status: "active", startedAt: NOV });
    });
    await h.admin.mutation(api.reports.save, {
      clientId: h.clientA,
      month: NOV,
      summary: "Novembre meglio",
      nextSteps: "Campagna di dicembre",
      metrics: [{ key: "web.visits", value: 1500, label: "FALSO", unit: "eur" }, { key: "custom.newsletter", label: "Iscritti newsletter", unit: "count", value: 42, note: "Mailchimp" }],
    });
    const r = (await h.admin.query(api.reports.get, { clientId: h.clientA, month: NOV }))!;
    expect(r.status).toBe("draft");
    expect(r.metrics).toEqual([
      { key: "web.visits", label: "Visite al sito", unit: "count", value: 1500, note: null, previous: 1000 },
      { key: "custom.newsletter", label: "Iscritti newsletter", unit: "count", value: 42, note: "Mailchimp", previous: null },
    ]);
    // Solo la fattura pagata e visibile del mese; la bozza e quella nascosta non contano.
    expect(r.auto).toMatchObject({ paidCents: 50000, paidCount: 1, activeSubscriptions: 1, monthlyRecurringCents: 1000 });
    expect(await h.admin.query(api.reports.previousKeys, { clientId: h.clientA, month: NOV })).toEqual(["web.visits", "web.bounce"]);
    expect((await h.admin.query(api.reports.list, { clientId: h.clientA })).map((x) => x.month)).toEqual([NOV, OCT]);
  });

  it("rifiuta mesi non validi e metriche false", async () => {
    const h = await setup();
    const base = { clientId: h.clientA, summary: null, nextSteps: null };
    expect(await code(h.admin.mutation(api.reports.save, { ...base, month: NOV + 1, metrics: [] }))).not.toBe("OK");
    expect(await code(h.admin.mutation(api.reports.save, { ...base, month: Date.UTC(2019, 0, 1), metrics: [] }))).not.toBe("OK");
    expect(await code(h.admin.mutation(api.reports.save, { ...base, month: Date.UTC(2030, 0, 1), metrics: [] }))).not.toBe("OK");
    expect(await code(h.admin.mutation(api.reports.save, { ...base, month: NOV, metrics: [{ key: "inventata", value: 1 }] }))).not.toBe("OK");
    expect(await code(h.admin.mutation(api.reports.save, { ...base, month: NOV, metrics: [{ key: "web.visits", value: Number.NaN }] }))).not.toBe("OK");
    expect(await h.t.run((ctx) => ctx.db.query("clientReports").collect())).toHaveLength(0);
  });

  it("non si pubblica un report vuoto; eliminare un report pubblicato richiede conferma esplicita", async () => {
    const h = await setup();
    await h.admin.mutation(api.reports.save, { clientId: h.clientA, month: NOV, summary: null, nextSteps: null, metrics: [] });
    expect(await code(h.admin.mutation(api.reports.setPublished, { clientId: h.clientA, month: NOV, published: true }))).toBe("BAD_STATE");
    await h.admin.mutation(api.reports.save, { clientId: h.clientA, month: NOV, summary: "Testo", nextSteps: null, metrics: [] });
    await h.admin.mutation(api.reports.setPublished, { clientId: h.clientA, month: NOV, published: true });
    expect(await code(h.admin.mutation(api.reports.remove, { clientId: h.clientA, month: NOV }))).toBe("BAD_STATE");
    await h.admin.mutation(api.reports.remove, { clientId: h.clientA, month: NOV, confirmPublished: true });
    expect(await h.t.run((ctx) => ctx.db.query("clientReports").collect())).toHaveLength(0);
    const log = await h.t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["report.saved", "report.published", "report.deleted"]));
  });
});

describe("report mensile: portale cliente", () => {
  async function published() {
    const h = await setup();
    await h.admin.mutation(api.reports.save, { clientId: h.clientA, month: NOV, summary: "Visibile", nextSteps: null, metrics: [{ key: "web.visits", value: 10 }] });
    await h.admin.mutation(api.reports.setPublished, { clientId: h.clientA, month: NOV, published: true });
    await h.admin.mutation(api.reports.save, { clientId: h.clientA, month: OCT, summary: "BOZZA SEGRETA", nextSteps: null, metrics: [{ key: "web.visits", value: 5 }] });
    await h.admin.mutation(api.reports.save, { clientId: h.clientB, month: NOV, summary: "ALTRO CLIENTE", nextSteps: null, metrics: [{ key: "web.visits", value: 99 }] });
    await h.admin.mutation(api.reports.setPublished, { clientId: h.clientB, month: NOV, published: true });
    return h;
  }

  it("serve il codice di sblocco", async () => {
    const h = await published();
    const link = await h.admin.mutation(api.accessLinks.create, { clientId: h.clientA });
    expect(await code(h.t.query(api.portal.reports, { token: link.token, unlockToken: "x".repeat(43) }))).toBe("UNLOCK_REQUIRED");
    expect(await code(h.t.query(api.portal.report, { token: link.token, unlockToken: "x".repeat(43), month: NOV }))).toBe("UNLOCK_REQUIRED");
    expect(await code(h.t.query(api.portal.reports, { token: "non-valido", unlockToken: "x" }))).toBe("INVALID_LINK");
  });

  it("il cliente vede solo i report pubblicati del proprio account, con il confronto sul mese prima ma senza bozze", async () => {
    const h = await published();
    const s = await unlock(h, h.clientA);
    const list = await h.t.query(api.portal.reports, s);
    expect(list.map((r) => r.month)).toEqual([NOV]);
    const r = (await h.t.query(api.portal.report, { ...s, month: NOV }))!;
    expect(r.summary).toBe("Visibile");
    expect(r.metrics[0]).toMatchObject({ key: "web.visits", value: 10, previous: null }); // ottobre e' una bozza: non si rivela
    expect(await h.t.query(api.portal.report, { ...s, month: OCT })).toBeNull();
    expect(await h.t.query(api.portal.report, { ...s, month: NOV + 5 })).toBeNull();
    const json = JSON.stringify([list, r]);
    expect(json).not.toContain("BOZZA SEGRETA");
    expect(json).not.toContain("ALTRO CLIENTE");
    expect(json).not.toContain("clientId");
  });

  it("un link non apre i report di un altro cliente", async () => {
    const h = await published();
    const a = await unlock(h, h.clientA);
    const linkB = await h.admin.mutation(api.accessLinks.create, { clientId: h.clientB });
    expect(await code(h.t.query(api.portal.reports, { token: linkB.token, unlockToken: a.unlockToken }))).toBe("UNLOCK_REQUIRED");
  });

  it("la panoramica dice solo se esistono report pubblicati", async () => {
    const h = await published();
    const linkA = await h.admin.mutation(api.accessLinks.create, { clientId: h.clientA });
    expect((await h.t.query(api.portal.overview, { token: linkA.token })).hasReports).toBe(true);
    await h.admin.mutation(api.reports.setPublished, { clientId: h.clientA, month: NOV, published: false });
    expect((await h.t.query(api.portal.overview, { token: linkA.token })).hasReports).toBe(false);
  });
});
