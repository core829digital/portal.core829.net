/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const d = (y: number, m: number, day = 1) => Date.UTC(y, m - 1, day);
const NOW = d(2026, 11, 7);

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|s1`, issuer: "https://test.local", tokenIdentifier: `https://test.local|${userId}|s1` });
}

async function setup() {
  const t = convexTest(schema, modules);
  const adminId = await t.run(async (ctx) => {
    await ctx.db.insert("admins", { email: "stefan@core829.net", addedAt: Date.now() });
    return ctx.db.insert("users", { email: "stefan@core829.net", emailVerificationTime: Date.now() });
  });
  const otherId = await t.run((ctx) => ctx.db.insert("users", { email: "altro@esempio.it", emailVerificationTime: Date.now() }));
  const clientId = await t.run((ctx) =>
    ctx.db.insert("clients", { displayName: "Cliente A", contactName: "A", email: "a@esempio.it", packageType: "custom", status: "active" }),
  );
  const clientB = await t.run((ctx) =>
    ctx.db.insert("clients", { displayName: "Cliente B", contactName: "B", email: "b@esempio.it", packageType: "custom", status: "onboarding" }),
  );
  return { t, admin: asUser(t, adminId), other: asUser(t, otherId), clientId, clientB };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function seedData(h: Awaited<ReturnType<typeof setup>>) {
  await h.t.run(async (ctx) => {
    const base = { currency: "EUR" as const, visibleToClient: true };
    await ctx.db.insert("invoices", { ...base, clientId: h.clientId, number: "A-1", issuedAt: d(2026, 1, 4), dueAt: d(2026, 1, 4), amountCents: 100000, status: "paid", paidAt: d(2026, 1, 4) });
    await ctx.db.insert("invoices", { ...base, clientId: h.clientId, number: "A-2", issuedAt: d(2026, 11, 2), dueAt: d(2026, 11, 2), amountCents: 20000, status: "paid", paidAt: d(2026, 11, 2) });
    await ctx.db.insert("invoices", { ...base, clientId: h.clientB, number: "B-1", issuedAt: d(2026, 10, 1), dueAt: d(2026, 10, 15), amountCents: 50000, status: "overdue" });
    await ctx.db.insert("invoices", { ...base, clientId: h.clientB, number: "B-2", issuedAt: d(2026, 11, 7), dueAt: d(2026, 11, 20), amountCents: 30000, status: "sent" });
    await ctx.db.insert("invoices", { ...base, clientId: h.clientB, number: "B-3", issuedAt: d(2026, 11, 7), dueAt: d(2026, 11, 20), amountCents: 77777, status: "draft" });
    await ctx.db.insert("subscriptions", { clientId: h.clientId, name: "Mensile", amountCents: 10700, currency: "EUR", interval: "month", status: "active", startedAt: d(2026, 11, 11), nextRenewalAt: d(2026, 11, 11) });
    await ctx.db.insert("subscriptions", { clientId: h.clientB, name: "Annuale", amountCents: 12000, currency: "EUR", interval: "year", status: "active", startedAt: d(2026, 7, 7), nextRenewalAt: d(2027, 7, 7) });
    await ctx.db.insert("projects", { clientId: h.clientId, name: "P1", status: "in_progress", progress: 40 });
    await ctx.db.insert("projects", { clientId: h.clientId, name: "P2", status: "completed", progress: 100 });
  });
}

describe("dashboard admin", () => {
  it("calcola i KPI con le definizioni stabilite", async () => {
    const h = await setup();
    await seedData(h);
    const data = await h.admin.query(api.dashboard.overview, { nowMs: NOW });
    expect(data.kpis).toMatchObject({
      collectedYearCents: 120000,
      collectedThisMonthCents: 20000,
      outstandingCents: 80000, // 50.000 scaduta + 30.000 inviata; la bozza (77.777) non conta
      overdueCents: 50000,
      overdueCount: 1,
      mrrCents: 10700 + 1000,
      arrCents: (10700 + 1000) * 12,
      activeClients: 1,
      totalClients: 2,
      openProjects: 1,
      completedProjects: 1,
      renewals30dCount: 1,
      renewals30dCents: 10700,
    });
    expect(data.revenueByMonth).toHaveLength(12);
    expect(data.revenueByMonth[11].cents).toBe(20000);
    expect(data.topClients[0]).toMatchObject({ name: "Cliente A", cents: 120000 });
    expect(data.invoicesByStatus.draft.count).toBe(1);
    expect(data.upcoming[0]).toMatchObject({ kind: "invoice", overdue: true });
    expect(data.truncated).toBe(false);
  });

  it("senza dati restituisce zeri, non errori", async () => {
    const h = await setup();
    const data = await h.admin.query(api.dashboard.overview, { nowMs: NOW });
    expect(data.kpis.collectedYearCents).toBe(0);
    expect(data.revenueByMonth.every((m) => m.cents === 0)).toBe(true);
    expect(data.upcoming).toEqual([]);
  });

  it("liste globali con nome cliente e filtro per stato", async () => {
    const h = await setup();
    await seedData(h);
    expect(await h.admin.query(api.dashboard.invoices, {})).toHaveLength(5);
    const overdue = await h.admin.query(api.dashboard.invoices, { status: "overdue" });
    expect(overdue).toHaveLength(1);
    expect(overdue[0].clientName).toBe("Cliente B");
    expect(await h.admin.query(api.dashboard.subscriptions, { status: "active" })).toHaveLength(2);
    expect(await h.admin.query(api.dashboard.projects, { status: "completed" })).toHaveLength(1);
  });

  it("chi non e' amministratore non vede nulla, ne' senza accesso", async () => {
    const h = await setup();
    await seedData(h);
    for (const caller of [h.other, h.t] as unknown as (typeof h.admin)[]) {
      await expect(caller.query(api.dashboard.overview, { nowMs: NOW })).rejects.toThrow();
      await expect(caller.query(api.dashboard.invoices, {})).rejects.toThrow();
      await expect(caller.query(api.dashboard.subscriptions, {})).rejects.toThrow();
      await expect(caller.query(api.dashboard.projects, {})).rejects.toThrow();
      await expect(caller.query(api.dashboard.activity, {})).rejects.toThrow();
    }
  });

  it("rifiuta un'ora non valida", async () => {
    const h = await setup();
    await expect(h.admin.query(api.dashboard.overview, { nowMs: -5 })).rejects.toThrow();
  });
});
