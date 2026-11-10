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
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { data?: { code?: string } }).data?.code ?? String(e).slice(0, 80);
  }
};

async function seedFor(h: Awaited<ReturnType<typeof setup>>, clientId: Id<"clients">, tag: string) {
  return h.t.run(async (ctx) => ({
    sub: await ctx.db.insert("subscriptions", { clientId, name: `Hosting ${tag}`, amountCents: 100, currency: "EUR", interval: "month", status: "active", startedAt: NOW }),
    cancelledSub: await ctx.db.insert("subscriptions", { clientId, name: `Vecchio ${tag}`, amountCents: 100, currency: "EUR", interval: "month", status: "cancelled", startedAt: NOW }),
    inv: await ctx.db.insert("invoices", { clientId, number: `${tag}/1`, issuedAt: NOW, dueAt: NOW + DAY, amountCents: 100, currency: "EUR", status: "sent", visibleToClient: true }),
    draft: await ctx.db.insert("invoices", { clientId, number: `${tag}/2`, issuedAt: NOW, dueAt: NOW + DAY, amountCents: 100, currency: "EUR", status: "draft", visibleToClient: true }),
    hidden: await ctx.db.insert("invoices", { clientId, number: `${tag}/3`, issuedAt: NOW, dueAt: NOW + DAY, amountCents: 100, currency: "EUR", status: "sent", visibleToClient: false }),
    proj: await ctx.db.insert("projects", { clientId, name: `Sito ${tag}`, status: "in_progress", progress: 10 }),
  }));
}

describe("ticket collegati", () => {
  it("il cliente collega la richiesta a un suo pagamento/abbonamento/progetto e lo rivede in elenco e dettaglio", async () => {
    const h = await track();
    const s = await h.unlock(h.clientA);
    const a = await seedFor(h, h.clientA, "A");
    const id = await h.t.mutation(api.tickets.portalCreate, { ...s, subject: "Fattura sbagliata", category: "billing", body: "Importo errato", invoiceId: a.inv, subscriptionId: a.sub, projectId: a.proj });
    const list = await h.t.query(api.tickets.portalList, s);
    expect(list[0].related).toEqual(["Abbonamento: Hosting A", "Fattura A/1", "Progetto: Sito A"]);
    expect((await h.t.query(api.tickets.portalGet, { ...s, ticketId: id })).related).toHaveLength(3);
    const opts = await h.t.query(api.tickets.portalRelatable, s);
    expect(opts.invoices.map((x) => x.label)).toEqual(["Fattura A/1"]); // niente bozze, niente nascoste
    expect(opts.subscriptions.map((x) => x.label)).toEqual(["Hosting A"]); // niente annullati
    expect(opts.projects).toHaveLength(1);
  });

  it("il cliente non puo' collegare cose di altri clienti, bozze, nascoste o annullate", async () => {
    const h = await track();
    const s = await h.unlock(h.clientA);
    const a = await seedFor(h, h.clientA, "A");
    const b = await seedFor(h, h.clientB, "B");
    const base = { ...s, subject: "Una domanda", category: "question" as const, body: "Ciao ciao" };
    for (const bad of [{ invoiceId: b.inv }, { subscriptionId: b.sub }, { projectId: b.proj }, { invoiceId: a.draft }, { invoiceId: a.hidden }, { subscriptionId: a.cancelledSub }]) {
      expect(await code(h.t.mutation(api.tickets.portalCreate, { ...base, ...bad }))).toBe("NOT_FOUND");
    }
    expect(await h.t.run((ctx) => ctx.db.query("tickets").collect())).toHaveLength(0);
  });

  it("l'amministratore collega, cambia e scollega; non puo' usare elementi di un altro cliente", async () => {
    const h = await track();
    const s = await h.unlock(h.clientA);
    const a = await seedFor(h, h.clientA, "A");
    const b = await seedFor(h, h.clientB, "B");
    const id = await h.t.mutation(api.tickets.portalCreate, { ...s, subject: "Una domanda", category: "question", body: "Ciao ciao" });
    expect(await code(h.admin.mutation(api.tickets.setLinks, { ticketId: id, invoiceId: b.inv, subscriptionId: null, projectId: null }))).toBe("NOT_FOUND");
    await h.admin.mutation(api.tickets.setLinks, { ticketId: id, invoiceId: a.draft, subscriptionId: a.cancelledSub, projectId: null }); // l'admin puo' anche bozze/annullati
    const d = await h.admin.query(api.tickets.get, { ticketId: id });
    expect(d?.invoiceId).toBe(a.draft);
    expect(d?.related.map((r) => r.kind)).toEqual(["subscription", "invoice"]);
    await h.admin.mutation(api.tickets.setLinks, { ticketId: id, invoiceId: null, subscriptionId: null, projectId: null });
    expect((await h.admin.query(api.tickets.get, { ticketId: id }))?.related).toEqual([]);
    expect(await code(h.stranger.mutation(api.tickets.setLinks, { ticketId: id, invoiceId: null, subscriptionId: null, projectId: null }))).not.toBe("OK");
  });

  it("l'elenco dell'amministratore mostra a cosa si riferisce ogni ticket", async () => {
    const h = await track();
    const s = await h.unlock(h.clientA);
    const a = await seedFor(h, h.clientA, "A");
    await h.t.mutation(api.tickets.portalCreate, { ...s, subject: "Una domanda", category: "billing", body: "Ciao ciao", invoiceId: a.inv });
    expect((await h.admin.query(api.tickets.list, {}))[0].related).toEqual(["Fattura A/1"]);
  });
});

describe("scadenze collegate", () => {
  const manual = (h: Awaited<ReturnType<typeof setup>>, over: Record<string, unknown>) => h.admin.mutation(api.deadlines.create, { title: "Sollecitare", dueAt: NOW + 3 * DAY, category: "other", ...over } as never);

  it("il cliente si ricava dal collegamento e deve coincidere", async () => {
    const h = await track();
    const a = await seedFor(h, h.clientA, "A");
    const b = await seedFor(h, h.clientB, "B");
    const id = await manual(h, { invoiceId: a.inv });
    expect((await h.t.run((ctx) => ctx.db.get(id)))?.clientId).toBe(h.clientA);
    expect(await code(manual(h, { clientId: h.clientA, subscriptionId: b.sub }))).toBe("NOT_FOUND");
    expect(await code(manual(h, { projectId: b.proj }))).toBe("OK"); // il cliente B si ricava dal progetto
    expect(await code(manual(h, { invoiceId: a.inv, projectId: b.proj }))).toBe("NOT_FOUND"); // collegamenti di clienti diversi
  });

  it("lo scadenziario mostra il collegamento", async () => {
    const h = await track();
    const a = await seedFor(h, h.clientA, "A");
    await manual(h, { subscriptionId: a.sub, projectId: a.proj });
    const items = await h.admin.query(api.deadlines.overview, { nowMs: NOW });
    expect(items.find((i) => i.kind === "manual")?.related).toEqual(["Abbonamento: Hosting A", "Progetto: Sito A"]);
  });

  it("incassare o annullare un pagamento chiude da sola la scadenza collegata (e solo quella)", async () => {
    const h = await track();
    const a = await seedFor(h, h.clientA, "A");
    const linked = await manual(h, { invoiceId: a.inv });
    const other = await manual(h, { clientId: h.clientA });
    await h.admin.mutation(api.invoices.setStatus, { invoiceId: a.inv, status: "paid" });
    expect((await h.t.run((ctx) => ctx.db.get(linked)))?.done).toBe(true);
    expect((await h.t.run((ctx) => ctx.db.get(other)))?.done).toBe(false);
  });

  it("annullare un abbonamento chiude la scadenza collegata", async () => {
    const h = await track();
    const a = await seedFor(h, h.clientA, "A");
    const d = await manual(h, { subscriptionId: a.sub });
    await h.admin.mutation(api.subscriptions.setStatus, { subscriptionId: a.sub, status: "cancelled" });
    expect((await h.t.run((ctx) => ctx.db.get(d)))?.done).toBe(true);
  });
});
