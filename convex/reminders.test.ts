/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const d = (y: number, m: number, day: number, h = 0) => Date.UTC(y, m - 1, day, h);

async function makeClient(t: ReturnType<typeof convexTest>) {
  return t.run((ctx) => ctx.db.insert("clients", { displayName: "DBYoung (Dimitri)", contactName: "Dimitri", email: "dimitri@esempio.it", packageType: "custom", status: "active" }));
}

async function makeSub(t: ReturnType<typeof convexTest>, clientId: Id<"clients">, extra: Record<string, unknown> = {}) {
  return t.run((ctx) =>
    ctx.db.insert("subscriptions", {
      clientId,
      name: "Pagamento mensile dbyoung.it",
      amountCents: 10700,
      currency: "EUR",
      interval: "month",
      status: "active",
      startedAt: d(2026, 11, 11),
      nextRenewalAt: d(2026, 11, 11),
      ...extra,
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("avanzamento delle date di rinnovo", () => {
  it("dopo la scadenza il rinnovo passa al mese successivo", async () => {
    vi.setSystemTime(d(2026, 11, 12, 6));
    const t = convexTest(schema, modules);
    const subscriptionId = await makeSub(t, await makeClient(t));
    expect(await t.mutation(internal.reminders.run, {})).toEqual({ advanced: 1 });
    expect((await t.run((ctx) => ctx.db.get("subscriptions", subscriptionId)))?.nextRenewalAt).toBe(d(2026, 12, 11));
    expect(await t.mutation(internal.reminders.run, {})).toEqual({ advanced: 0 }); // niente doppio avanzamento
  });

  it("non tocca i rinnovi futuri, quelli del giorno stesso (1 giorno di tolleranza) e gli abbonamenti annullati", async () => {
    vi.setSystemTime(d(2026, 11, 11, 20));
    const t = convexTest(schema, modules);
    const client = await makeClient(t);
    const futuro = await makeSub(t, client, { nextRenewalAt: d(2026, 11, 20) });
    const oggi = await makeSub(t, client);
    await makeSub(t, client, { status: "cancelled", nextRenewalAt: d(2026, 10, 1) });
    expect(await t.mutation(internal.reminders.run, {})).toEqual({ advanced: 0 });
    expect((await t.run((ctx) => ctx.db.get("subscriptions", futuro)))?.nextRenewalAt).toBe(d(2026, 11, 20));
    expect((await t.run((ctx) => ctx.db.get("subscriptions", oggi)))?.nextRenewalAt).toBe(d(2026, 11, 11));
  });

  it("non spedisce nessuna email (l'unico promemoria e' quello delle 10:30 del giorno prima)", async () => {
    vi.setSystemTime(d(2026, 11, 8, 6)); // 3 giorni prima del rinnovo
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    await makeSub(t, await makeClient(t));
    await t.mutation(internal.reminders.run, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("notifications").collect())).toHaveLength(0);
  });
});
