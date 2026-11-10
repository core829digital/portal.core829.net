/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { collectDueForTest } from "./paymentReminders";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.UTC(2026, 10, 10, 9, 0, 0);
const asUser = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId}|s`, issuer: "https://test.local", tokenIdentifier: `https://test.local|${userId}|s` });
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { data?: { code?: string } }).data?.code ?? String(e);
  }
};

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: "stefan@core829.net", addedAt: Date.now() }));
  const uid = await t.run((ctx) => ctx.db.insert("users", { email: "stefan@core829.net", emailVerificationTime: Date.now() }));
  const admin = asUser(t, uid);
  const client = (n: string) => t.run((ctx) => ctx.db.insert("clients", { displayName: `C ${n}`, contactName: n, email: `${n}@e.it`, packageType: "standard", status: "active" }));
  const a = await client("a");
  const b = await client("b");
  const sub = (clientId: Id<"clients">, name: string, amountCents: number) =>
    admin.mutation(api.subscriptions.create, { clientId, name, amountCents, interval: "month", startedAt: NOW });
  return { t, admin, a, b, sub };
}

const inv = (clientId: Id<"clients">, number: string, amountCents: number, extra: object = {}) => ({ clientId, number, issuedAt: NOW, dueAt: NOW + 86400000, amountCents, ...extra });

describe("fattura ↔ abbonamento", () => {
  it("si collega alla creazione e compare in elenco con il nome dell'abbonamento", async () => {
    const h = await setup();
    const s = await h.sub(h.a, "Hosting", 9000);
    const id = await h.admin.mutation(api.invoices.create, inv(h.a, "2026/001", 9000, { subscriptionId: s }));
    const list = await h.admin.query(api.invoices.listByClient, { clientId: h.a });
    expect(list.find((i) => i._id === id)?.subscriptionName).toBe("Hosting");
    const subs = await h.admin.query(api.subscriptions.listByClient, { clientId: h.a });
    expect(subs[0]).toMatchObject({ linkedCount: 1, openCount: 0 });
  });

  it("rifiuta l'abbonamento di un altro cliente o annullato", async () => {
    const h = await setup();
    const other = await h.sub(h.b, "Altro", 100);
    expect(await code(h.admin.mutation(api.invoices.create, inv(h.a, "2026/002", 100, { subscriptionId: other })))).toBe("NOT_FOUND");
    const s = await h.sub(h.a, "Vecchio", 100);
    await h.admin.mutation(api.subscriptions.setStatus, { subscriptionId: s, status: "cancelled" });
    expect(await code(h.admin.mutation(api.invoices.create, inv(h.a, "2026/003", 100, { subscriptionId: s })))).toBe("BAD_STATE");
    const id = await h.admin.mutation(api.invoices.create, inv(h.a, "2026/004", 100));
    expect(await code(h.admin.mutation(api.invoices.setSubscription, { invoiceId: id, subscriptionId: other }))).toBe("NOT_FOUND");
  });

  it("collega e scollega anche un pagamento gia' chiuso", async () => {
    const h = await setup();
    const s = await h.sub(h.a, "Hosting", 9000);
    const id = await h.admin.mutation(api.invoices.create, inv(h.a, "2026/005", 9000));
    await h.admin.mutation(api.invoices.setStatus, { invoiceId: id, status: "sent" });
    await h.admin.mutation(api.invoices.setStatus, { invoiceId: id, status: "paid" });
    await h.admin.mutation(api.invoices.setSubscription, { invoiceId: id, subscriptionId: s });
    expect((await h.admin.query(api.subscriptions.listByClient, { clientId: h.a }))[0].lastPaidAt).toBeTypeOf("number");
    await h.admin.mutation(api.invoices.setSubscription, { invoiceId: id, subscriptionId: null });
    expect((await h.admin.query(api.subscriptions.listByClient, { clientId: h.a }))[0].linkedCount).toBe(0);
  });

  it("propone il collegamento solo se c'e' un unico abbonamento con lo stesso importo", async () => {
    const h = await setup();
    const s1 = await h.sub(h.a, "Hosting", 9000);
    await h.sub(h.a, "Manutenzione", 5000);
    await h.admin.mutation(api.invoices.create, inv(h.a, "2026/010", 9000));
    await h.admin.mutation(api.invoices.create, inv(h.a, "2026/011", 7777)); // nessun abbonamento con questo importo
    const sug = await h.admin.query(api.invoices.linkSuggestions, { clientId: h.a });
    expect(sug).toHaveLength(1);
    expect(sug[0].subscriptionId).toBe(s1);
    expect(await h.admin.mutation(api.invoices.applyLinkSuggestions, { clientId: h.a })).toBe(1);
    expect(await h.admin.query(api.invoices.linkSuggestions, { clientId: h.a })).toHaveLength(0);
    // due abbonamenti con lo stesso importo: ambiguo, non propone
    await h.sub(h.b, "X", 100);
    await h.sub(h.b, "Y", 100);
    await h.admin.mutation(api.invoices.create, inv(h.b, "2026/012", 100));
    expect(await h.admin.query(api.invoices.linkSuggestions, { clientId: h.b })).toHaveLength(0);
  });

  it("il promemoria non duplica: pagamento collegato + rinnovo = una sola riga", async () => {
    const h = await setup();
    const due = Date.UTC(2026, 10, 11, 11, 0, 0);
    const s = await h.sub(h.a, "Hosting", 9000);
    await h.t.run(async (ctx) => {
      await ctx.db.patch("subscriptions", s, { nextRenewalAt: due });
      await ctx.db.insert("invoices", { clientId: h.a, subscriptionId: s, number: "9", issuedAt: NOW, dueAt: due, amountCents: 9000, currency: "EUR", status: "sent", visibleToClient: true });
    });
    const items = await h.t.run(async (ctx) => [...(await collectDueForTest(ctx, due - 1000, due + 1000)).values()].flat().map((i) => ({ kind: i.kind })));
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("invoice");
  });
});
