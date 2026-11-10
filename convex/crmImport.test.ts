/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const asUser = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId}|s`, issuer: "https://test.local", tokenIdentifier: `https://test.local|${userId}|s` });

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: "stefan@core829.net", addedAt: 1 }));
  const mk = (email: string) => t.run((ctx) => ctx.db.insert("users", { email, emailVerificationTime: 1 }));
  return { t, admin: asUser(t, await mk("stefan@core829.net")), stranger: asUser(t, await mk("x@y.it")) };
}

const file = () => ({
  format: "core829-crm-export/1",
  leads: [{ ref: "L1", leadName: "Solo lead" }], // i lead non entrano nel portale
  clients: [
    {
      ref: "C1", clientName: "Dimitri Boutourline", company: "Studio D", email: "d@x.it", phone: "+39 333 1112223", website: "https://x.it", notes: "nota",
      projects: [{
        ref: "P1", projectName: "Sito web", description: "Vetrina", status: "Active", startDate: "2026-01-10T00:00:00.000Z", totalValue: 500,
        invoices: [
          { ref: "I1", invoiceNumber: "2026/001", amount: 90, status: "Paid", createdAt: "2026-02-01T00:00:00.000Z" },
          { ref: "I2", invoiceNumber: "2026/002", amount: 50.5, status: "Pending", createdAt: "2026-03-01T00:00:00.000Z" },
          { ref: "I3", invoiceNumber: "bad number!", amount: 1, status: "Pending" },
        ],
      }],
      services: [{ ref: "S1", serviceName: "Hosting", quoteAmount: 30, status: "Accepted" }],
    },
    { ref: "C2", clientName: "Senza Email", company: "X", email: "", projects: [] },
  ],
});

describe("importazione dal CRM", () => {
  it("anteprima non scrive; import crea clienti/progetti/fatture NASCOSTE; il secondo import non duplica", async () => {
    const h = await setup();
    const dry = await h.admin.mutation(api.crmImport.run, { payload: file(), dryRun: true });
    expect(dry).toMatchObject({ clientsCreated: 1, projectsCreated: 1, invoicesCreated: 2, servicesIgnored: 1 });
    expect(dry.clientsSkipped).toHaveLength(1);
    expect(dry.invoicesSkipped).toHaveLength(1);
    expect(await h.t.run(async (ctx) => (await ctx.db.query("clients").collect()).length)).toBe(0);

    await h.admin.mutation(api.crmImport.run, { payload: file(), dryRun: false });
    const state = () => h.t.run(async (ctx) => ({ c: await ctx.db.query("clients").collect(), p: await ctx.db.query("projects").collect(), i: await ctx.db.query("invoices").collect(), subs: (await ctx.db.query("subscriptions").collect()).length }));
    const s1 = await state();
    expect(s1.c).toHaveLength(1);
    expect(s1.c[0]).toMatchObject({ displayName: "Studio D", contactName: "Dimitri Boutourline", email: "d@x.it", status: "active", crmRef: "C1" });
    expect(s1.p[0]).toMatchObject({ name: "Sito web", status: "in_progress" });
    expect(s1.i.map((x) => [x.number, x.amountCents, x.status, x.visibleToClient]).sort()).toEqual([["2026/001", 9000, "paid", false], ["2026/002", 5050, "sent", false]]);
    expect(s1.subs).toBe(0);

    const again = await h.admin.mutation(api.crmImport.run, { payload: file(), dryRun: false });
    expect(again).toMatchObject({ clientsCreated: 0, clientsMatched: 1, projectsCreated: 0, projectsExisting: 1, invoicesCreated: 0, invoicesExisting: 2 });
    const s2 = await state();
    expect([s2.c.length, s2.p.length, s2.i.length]).toEqual([1, 1, 2]);
  });

  it("un secondo import porta le fatture nuove di un progetto gia' importato", async () => {
    const h = await setup();
    await h.admin.mutation(api.crmImport.run, { payload: file(), dryRun: false });
    const f = file();
    f.clients[0].projects![0].invoices!.push({ ref: "I4", invoiceNumber: "2026/004", amount: 10, status: "Pending", createdAt: "2026-04-01T00:00:00.000Z" } as never);
    const r = await h.admin.mutation(api.crmImport.run, { payload: f, dryRun: false });
    expect(r).toMatchObject({ projectsExisting: 1, invoicesCreated: 1, invoicesExisting: 2 });
  });

  it("completa un cliente gia' presente (stessa email) senza sovrascrivere i suoi dati", async () => {
    const h = await setup();
    await h.t.run((ctx) => ctx.db.insert("clients", { displayName: "Nome Mio", contactName: "Dimitri Boutourline", email: "d@x.it", packageType: "advanced", status: "active", phone: "+39 333 0000000" }));
    const r = await h.admin.mutation(api.crmImport.run, { payload: file(), dryRun: false });
    expect(r).toMatchObject({ clientsCreated: 0, clientsMatched: 1, clientsCompleted: 1 });
    const c = (await h.t.run((ctx) => ctx.db.query("clients").collect()))[0];
    expect(c).toMatchObject({ displayName: "Nome Mio", packageType: "advanced", phone: "+39 333 0000000", crmRef: "C1" }); // niente sovrascrittura
    expect(c.website).toBe("https://x.it"); // campo vuoto completato
  });

  it("un numero di fattura gia' usato da un altro cliente viene segnalato, non duplicato", async () => {
    const h = await setup();
    await h.t.run(async (ctx) => {
      const other = await ctx.db.insert("clients", { displayName: "Altro", contactName: "Altro", email: "altro@x.it", packageType: "standard", status: "active" });
      await ctx.db.insert("invoices", { clientId: other, number: "2026/001", issuedAt: 1, dueAt: 2, amountCents: 1, currency: "EUR", status: "paid", visibleToClient: true });
    });
    const r = await h.admin.mutation(api.crmImport.run, { payload: file(), dryRun: false });
    expect(r.invoicesSkipped.some((x) => x.includes("altro cliente"))).toBe(true);
    expect(await h.t.run(async (ctx) => (await ctx.db.query("invoices").collect()).length)).toBe(2); // 1 esistente + 2026/002
  });

  it("solo amministratori e file valido", async () => {
    const h = await setup();
    await expect(h.stranger.mutation(api.crmImport.run, { payload: file(), dryRun: true })).rejects.toThrow();
    await expect(h.admin.mutation(api.crmImport.run, { payload: { format: "x" }, dryRun: true })).rejects.toThrow(/non valido/);
  });
});
