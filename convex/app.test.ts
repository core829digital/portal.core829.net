/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "stefan@core829.net";
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 7, 10, 0, 0);

type Harness = Awaited<ReturnType<typeof setup>>;

/** Come fa Convex Auth: il subject del token e' "<userId>|<sessionId>". */
function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|session-1`,
    issuer: "https://test.local",
    tokenIdentifier: `https://test.local|${userId}|session-1`,
  });
}

async function setup() {
  const t = convexTest(schema, modules);
  const adminUserId = await t.run(async (ctx) => {
    await ctx.db.insert("admins", { email: ADMIN_EMAIL, addedAt: Date.now() });
    return ctx.db.insert("users", { email: ADMIN_EMAIL, emailVerificationTime: Date.now() });
  });
  return { t, admin: asUser(t, adminUserId) };
}

/** Restituisce il codice di errore applicativo, "OK" se la chiamata riesce. */
async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (e) {
    const data = (e as { data?: { code?: string } }).data;
    return data?.code ?? `ERRORE_INATTESO: ${String(e).slice(0, 120)}`;
  }
}

async function messageOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (e) {
    return (e as { data?: { message?: string } }).data?.message ?? String(e);
  }
}

async function newClient(h: Harness, n: string) {
  return h.admin.mutation(api.clients.create, {
    displayName: `Ristorante ${n}`,
    contactName: `Titolare ${n}`,
    email: `${n.toLowerCase()}@esempio.it`,
    packageType: "standard",
    internalNotes: `SEGRETO-INTERNO-${n}`,
  });
}

async function newLink(h: Harness, clientId: Id<"clients">, ttlDays?: number) {
  return h.admin.mutation(api.accessLinks.create, { clientId, ttlDays });
}

async function issue(h: Harness, linkId: Id<"accessLinks">) {
  return h.t.mutation(internal.otp.issueCode, { linkId });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("autorizzazione amministratore", () => {
  it("ogni funzione admin rifiuta anonimi, utenti non admin ed email non verificate", async () => {
    const h = await setup();
    const clientId = await newClient(h, "A");
    const projectId = await h.admin.mutation(api.projects.create, { clientId, name: "Sito" });
    const invoiceId = await h.admin.mutation(api.invoices.create, {
      clientId,
      number: "2026/001",
      issuedAt: NOW,
      dueAt: NOW + 30 * DAY,
      amountCents: 39000,
    });
    const subscriptionId = await h.admin.mutation(api.subscriptions.create, {
      clientId,
      name: "Hosting",
      amountCents: 9000,
      interval: "year",
      startedAt: NOW,
    });
    const { linkId } = await newLink(h, clientId);
    const storageId = await h.t.run(async (ctx) => ctx.storage.store(new Blob(["x"])));
    const documentId = await h.t.run(async (ctx) =>
      ctx.db.insert("documents", {
        clientId,
        kind: "contract",
        title: "Contratto",
        storageId,
        fileName: "c.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
        scanStatus: "clean",
        visibleToClient: true,
      }),
    );

    type Caller = Pick<typeof h.t, "query" | "mutation">;
    const calls: Record<string, (c: Caller) => Promise<unknown>> = {
      "clients.create": (c) => c.mutation(api.clients.create, { displayName: "X", contactName: "Y", email: "x@y.it", packageType: "custom" }),
      "clients.update": (c) => c.mutation(api.clients.update, { clientId, displayName: "Z" }),
      "clients.list": (c) => c.query(api.clients.list, { paginationOpts: { numItems: 5, cursor: null } }),
      "clients.get": (c) => c.query(api.clients.get, { clientId }),
      "projects.create": (c) => c.mutation(api.projects.create, { clientId, name: "P" }),
      "projects.update": (c) => c.mutation(api.projects.update, { projectId, name: "Q" }),
      "projects.addUpdate": (c) => c.mutation(api.projects.addUpdate, { projectId, title: "t", body: "b", visibleToClient: true }),
      "projects.listByClient": (c) => c.query(api.projects.listByClient, { clientId }),
      "projects.updatesByProject": (c) => c.query(api.projects.updatesByProject, { projectId }),
      "invoices.create": (c) => c.mutation(api.invoices.create, { clientId, number: "2026/099", issuedAt: NOW, dueAt: NOW, amountCents: 1 }),
      "invoices.update": (c) => c.mutation(api.invoices.update, { invoiceId, note: "n" }),
      "invoices.setStatus": (c) => c.mutation(api.invoices.setStatus, { invoiceId, status: "sent" }),
      "invoices.listByClient": (c) => c.query(api.invoices.listByClient, { clientId }),
      "subscriptions.create": (c) => c.mutation(api.subscriptions.create, { clientId, name: "S", amountCents: 1, interval: "month", startedAt: NOW }),
      "subscriptions.update": (c) => c.mutation(api.subscriptions.update, { subscriptionId, name: "S2" }),
      "subscriptions.setStatus": (c) => c.mutation(api.subscriptions.setStatus, { subscriptionId, status: "paused" }),
      "subscriptions.listByClient": (c) => c.query(api.subscriptions.listByClient, { clientId }),
      "accessLinks.create": (c) => c.mutation(api.accessLinks.create, { clientId }),
      "accessLinks.revoke": (c) => c.mutation(api.accessLinks.revoke, { linkId }),
      "accessLinks.listByClient": (c) => c.query(api.accessLinks.listByClient, { clientId }),
      "documents.listByClient": (c) => c.query(api.documents.listByClient, { clientId }),
      "documents.setVisibility": (c) => c.mutation(api.documents.setVisibility, { documentId, visibleToClient: false }),
      "pages.get": (c) => c.query(api.pages.get, { clientId }),
      "pages.save": (c) => c.mutation(api.pages.save, { clientId, widgets: [] }),
      "pages.reset": (c) => c.mutation(api.pages.reset, { clientId }),
      "pages.preview": (c) => c.query(api.pages.preview, { clientId }),
    };

    // Utente con sessione valida ed email verificata, ma NON nella tabella admins.
    const strangerId = await h.t.run(async (ctx) => ctx.db.insert("users", { email: "intruso@esempio.it", emailVerificationTime: NOW }));
    // Stessa email dell'admin ma mai verificata con il codice: non basta dichiararla.
    const unverifiedId = await h.t.run(async (ctx) => ctx.db.insert("users", { email: ADMIN_EMAIL }));
    // Utente senza email (es. account anonimo).
    const noEmailId = await h.t.run(async (ctx) => ctx.db.insert("users", {}));
    const stranger = asUser(h.t, strangerId);
    const unverified = asUser(h.t, unverifiedId);
    const noEmail = asUser(h.t, noEmailId);

    for (const [name, call] of Object.entries(calls)) {
      expect(await codeOf(call(h.t)), `${name} anonimo`).toBe("UNAUTHENTICATED");
      expect(await codeOf(call(stranger)), `${name} non admin`).toBe("FORBIDDEN");
      expect(await codeOf(call(unverified)), `${name} email non verificata`).toBe("FORBIDDEN");
      expect(await codeOf(call(noEmail)), `${name} senza email`).toBe("FORBIDDEN");
    }
    // L'amministratore vero passa.
    expect(await codeOf(calls["clients.get"](h.admin))).toBe("OK");
  });

  it("admins.me non lancia errori e riconosce solo l'admin", async () => {
    const h = await setup();
    const strangerId = await h.t.run(async (ctx) => ctx.db.insert("users", { email: "intruso@esempio.it", emailVerificationTime: NOW }));
    expect(await h.t.query(api.admins.me, {})).toEqual({ isAdmin: false });
    expect(await asUser(h.t, strangerId).query(api.admins.me, {})).toEqual({ isAdmin: false });
    expect(await h.admin.query(api.admins.me, {})).toEqual({ isAdmin: true });
  });

  it("l'email dell'admin e' confrontata senza distinguere maiuscole", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      await ctx.db.insert("admins", { email: "stefan@core829.net", addedAt: NOW });
      return ctx.db.insert("users", { email: "  STEFAN@Core829.net ", emailVerificationTime: NOW });
    });
    expect(await asUser(t, userId).query(api.admins.me, {})).toEqual({ isAdmin: true });
  });
});

describe("validazione e sanificazione dei dati", () => {
  it("normalizza email e ripulisce i caratteri invisibili nei nomi", async () => {
    const h = await setup();
    const id = await h.admin.mutation(api.clients.create, {
      displayName: "Trattoria" + String.fromCharCode(0x202e) + " Roma" + String.fromCharCode(0x200b),
      contactName: "  Mario   Rossi ",
      email: "  Mario@Esempio.IT ",
      packageType: "standard",
    });
    const client = await h.admin.query(api.clients.get, { clientId: id });
    expect(client?.displayName).toBe("Trattoria Roma");
    expect(client?.contactName).toBe("Mario Rossi");
    expect(client?.email).toBe("mario@esempio.it");
  });

  it("rifiuta input non validi con errore di validazione", async () => {
    const h = await setup();
    expect(
      await codeOf(h.admin.mutation(api.clients.create, { displayName: "x".repeat(500), contactName: "a", email: "a@b.it", packageType: "standard" })),
    ).toBe("VALIDATION");
    expect(
      await codeOf(h.admin.mutation(api.clients.create, { displayName: "ok", contactName: "a", email: "non-una-email", packageType: "standard" })),
    ).toBe("VALIDATION");
    expect(
      await codeOf(h.admin.mutation(api.clients.create, { displayName: "ok", contactName: "a", email: "a@b.it", phone: "12; DROP", packageType: "standard" })),
    ).toBe("VALIDATION");
  });

  it("email duplicata: conflitto", async () => {
    const h = await setup();
    await newClient(h, "A");
    expect(await codeOf(newClient(h, "A"))).toBe("CONFLICT");
  });

  it("il registro di audit registra le azioni e non contiene mai segreti", async () => {
    const h = await setup();
    const clientId = await newClient(h, "A");
    const { token } = await newLink(h, clientId);
    const logs = await h.t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("client.created");
    expect(actions).toContain("access_link.created");
    expect(JSON.stringify(logs)).not.toContain(token);
  });
});

describe("fatture e abbonamenti", () => {
  it("numero fattura unico, importi interi, scadenza non anteriore all'emissione", async () => {
    const h = await setup();
    const clientId = await newClient(h, "A");
    const base = { clientId, number: "2026/001", issuedAt: NOW, dueAt: NOW + DAY, amountCents: 39000 };
    await h.admin.mutation(api.invoices.create, base);
    expect(await codeOf(h.admin.mutation(api.invoices.create, base))).toBe("CONFLICT");
    expect(await codeOf(h.admin.mutation(api.invoices.create, { ...base, number: "2026/002", amountCents: 10.5 }))).toBe("VALIDATION");
    expect(await codeOf(h.admin.mutation(api.invoices.create, { ...base, number: "2026/003", amountCents: -5 }))).toBe("VALIDATION");
    expect(await codeOf(h.admin.mutation(api.invoices.create, { ...base, number: "2026/004", dueAt: NOW - DAY }))).toBe("VALIDATION");
  });

  it("una fattura non puo' riferirsi a un progetto di un altro cliente", async () => {
    const h = await setup();
    const a = await newClient(h, "A");
    const b = await newClient(h, "B");
    const projectOfB = await h.admin.mutation(api.projects.create, { clientId: b, name: "Sito B" });
    expect(
      await codeOf(
        h.admin.mutation(api.invoices.create, { clientId: a, projectId: projectOfB, number: "X1", issuedAt: NOW, dueAt: NOW, amountCents: 100 }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("transizioni di stato: bozza non si salda, pagata e' definitiva e immodificabile", async () => {
    const h = await setup();
    const clientId = await newClient(h, "A");
    const invoiceId = await h.admin.mutation(api.invoices.create, { clientId, number: "T1", issuedAt: NOW, dueAt: NOW + DAY, amountCents: 5000 });
    expect(await codeOf(h.admin.mutation(api.invoices.setStatus, { invoiceId, status: "paid" }))).toBe("BAD_STATE");
    await h.admin.mutation(api.invoices.setStatus, { invoiceId, status: "sent" });
    await h.admin.mutation(api.invoices.setStatus, { invoiceId, status: "paid" });
    const invoices = await h.admin.query(api.invoices.listByClient, { clientId });
    expect(invoices[0].status).toBe("paid");
    expect(invoices[0].paidAt).toBeGreaterThanOrEqual(NOW);
    expect(invoices[0].paidAt).toBeLessThan(NOW + 1000);
    expect(await codeOf(h.admin.mutation(api.invoices.update, { invoiceId, amountCents: 1 }))).toBe("BAD_STATE");
    expect(await codeOf(h.admin.mutation(api.invoices.setStatus, { invoiceId, status: "sent" }))).toBe("BAD_STATE");
  });

  it("un abbonamento annullato non si riattiva", async () => {
    const h = await setup();
    const clientId = await newClient(h, "A");
    const subscriptionId = await h.admin.mutation(api.subscriptions.create, { clientId, name: "Hosting", amountCents: 9000, interval: "year", startedAt: NOW });
    await h.admin.mutation(api.subscriptions.setStatus, { subscriptionId, status: "cancelled" });
    expect(await codeOf(h.admin.mutation(api.subscriptions.setStatus, { subscriptionId, status: "active" }))).toBe("BAD_STATE");
  });

  it("un aggiornamento di progetto prende il cliente dal progetto, non dagli argomenti", async () => {
    const h = await setup();
    const a = await newClient(h, "A");
    const projectId = await h.admin.mutation(api.projects.create, { clientId: a, name: "Sito" });
    const updateId = await h.admin.mutation(api.projects.addUpdate, { projectId, title: "Avvio", body: "Partiti", visibleToClient: true });
    const row = await h.t.run(async (ctx) => ctx.db.get("projectUpdates", updateId));
    expect(row?.clientId).toBe(a);
  });

  it("un progetto completato va sempre al 100%", async () => {
    const h = await setup();
    const clientId = await newClient(h, "A");
    const projectId = await h.admin.mutation(api.projects.create, { clientId, name: "Sito", progress: 40 });
    await h.admin.mutation(api.projects.update, { projectId, status: "completed" });
    const projects = await h.admin.query(api.projects.listByClient, { clientId });
    expect(projects[0].progress).toBe(100);
    expect(await codeOf(h.admin.mutation(api.projects.update, { projectId, progress: 150 }))).toBe("VALIDATION");
  });
});

describe("portale cliente: isolamento e visibilita'", () => {
  async function twoClients() {
    const h = await setup();
    const a = await newClient(h, "A");
    const b = await newClient(h, "B");
    const projectA = await h.admin.mutation(api.projects.create, { clientId: a, name: "Sito di A", status: "in_progress", progress: 60 });
    const projectB = await h.admin.mutation(api.projects.create, { clientId: b, name: "Sito di B" });
    await h.admin.mutation(api.projects.addUpdate, { projectId: projectA, title: "Visibile A", body: "ok", visibleToClient: true });
    await h.admin.mutation(api.projects.addUpdate, { projectId: projectA, title: "Nascosto A", body: "interno", visibleToClient: false });
    await h.admin.mutation(api.projects.addUpdate, { projectId: projectB, title: "Update di B", body: "ok", visibleToClient: true });
    const mk = async (clientId: Id<"clients">, number: string, status: "draft" | "sent" | "paid" | "cancelled", amount: number, visible = true) => {
      const invoiceId = await h.admin.mutation(api.invoices.create, { clientId, number, issuedAt: NOW, dueAt: NOW + DAY, amountCents: amount, visibleToClient: visible });
      if (status === "sent" || status === "paid") await h.admin.mutation(api.invoices.setStatus, { invoiceId, status: "sent" });
      if (status === "paid") await h.admin.mutation(api.invoices.setStatus, { invoiceId, status: "paid" });
      if (status === "cancelled") await h.admin.mutation(api.invoices.setStatus, { invoiceId, status: "cancelled" });
      return invoiceId;
    };
    await mk(a, "A-1", "sent", 39000);
    await mk(a, "A-2", "paid", 10000);
    await mk(a, "A-3", "draft", 99999);
    await mk(a, "A-4", "cancelled", 88888);
    await mk(a, "A-5", "sent", 77777, false);
    await mk(b, "B-1", "sent", 12345);
    await h.admin.mutation(api.subscriptions.create, { clientId: a, name: "Hosting A", amountCents: 9000, interval: "year", startedAt: NOW });
    const cancelled = await h.admin.mutation(api.subscriptions.create, { clientId: a, name: "Vecchio A", amountCents: 1000, interval: "month", startedAt: NOW });
    await h.admin.mutation(api.subscriptions.setStatus, { subscriptionId: cancelled, status: "cancelled" });
    await h.admin.mutation(api.subscriptions.create, { clientId: b, name: "Hosting B", amountCents: 7000, interval: "year", startedAt: NOW });
    const linkA = await newLink(h, a);
    const linkB = await newLink(h, b);
    return { h, a, b, linkA, linkB };
  }

  it("il cliente A vede solo i propri dati e nessun campo interno", async () => {
    const { h, linkA } = await twoClients();
    const data = await h.t.query(api.portal.overview, { token: linkA.token });
    const json = JSON.stringify(data);

    expect(data.client.displayName).toBe("Ristorante A");
    expect(data.projects.map((p) => p.name)).toEqual(["Sito di A"]);
    expect(data.projects[0].updates.map((u) => u.title)).toEqual(["Visibile A"]);
    expect(data.subscriptions.map((s) => s.name)).toEqual(["Hosting A"]);

    // Nulla di B, nulla di interno.
    for (const forbidden of ["Ristorante B", "Sito di B", "Update di B", "Hosting B", "B-1", "SEGRETO-INTERNO", "internalNotes", "clientId", "storageId", "tokenHash"]) {
      expect(json, `non deve contenere ${forbidden}`).not.toContain(forbidden);
    }
    expect(json).not.toContain(linkA.token);
  });

  it("fatture: bozze, annullate e nascoste non compaiono; i totali sono corretti", async () => {
    const { h, linkA } = await twoClients();
    const { billing } = await h.t.query(api.portal.overview, { token: linkA.token });
    expect(billing.invoices.map((i) => i.number).sort()).toEqual(["A-1", "A-2"]);
    // Da pagare = solo la fattura inviata e non pagata.
    expect(billing.outstandingCents).toBe(39000);
    expect(billing.overdueCents).toBe(0);
  });

  it("non esiste alcun modo di indicare un altro cliente: argomenti extra rifiutati", async () => {
    const { h, b, linkA } = await twoClients();
    await expect(
      h.t.query(api.portal.overview, { token: linkA.token, clientId: b } as unknown as { token: string }),
    ).rejects.toThrow();
  });

  it("ogni motivo di link non valido produce lo stesso identico errore", async () => {
    const { h, linkA } = await twoClients();
    const { token: revokedToken, linkId } = await newLink(h, (await h.admin.query(api.clients.list, { paginationOpts: { numItems: 5, cursor: null } })).page[0]._id);
    await h.admin.mutation(api.accessLinks.revoke, { linkId });

    const attempts = [
      "",
      "corto",
      "a".repeat(43), // forma corretta ma inesistente
      "<script>alert(1)</script>" + "x".repeat(20),
      linkA.token.slice(0, 42) + (linkA.token.endsWith("A") ? "B" : "A"), // un carattere diverso
      revokedToken, // revocato
    ];
    const results = await Promise.all(
      attempts.map(async (token) => ({ code: await codeOf(h.t.query(api.portal.overview, { token })), message: await messageOf(h.t.query(api.portal.overview, { token })) })),
    );
    for (const r of results) expect(r.code).toBe("INVALID_LINK");
    expect(new Set(results.map((r) => r.message)).size).toBe(1);
  });

  it("nel database il token non c'e' in chiaro, solo il suo hash", async () => {
    const { h, linkA } = await twoClients();
    const rows = await h.t.run(async (ctx) => ctx.db.query("accessLinks").collect());
    const mine = rows.find((r) => r._id === linkA.linkId);
    expect(mine?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(linkA.token);
    // L'elenco admin non rivela ne' il token ne' l'hash.
    const listing = await h.admin.query(api.accessLinks.listByClient, { clientId: mine!.clientId });
    expect(JSON.stringify(listing)).not.toContain(linkA.token);
    expect(JSON.stringify(listing)).not.toContain("tokenHash");
  });

  it("limite di 5 link attivi per cliente", async () => {
    const h = await setup();
    const a = await newClient(h, "A");
    for (let i = 0; i < 5; i++) await newLink(h, a);
    expect(await codeOf(newLink(h, a))).toBe("CONFLICT");
  });

  it("touch registra l'apertura, al massimo una volta al minuto", async () => {
    const { h, linkA } = await twoClients();
    await h.t.mutation(api.portal.touch, { token: linkA.token });
    await h.t.mutation(api.portal.touch, { token: linkA.token });
    vi.setSystemTime(NOW + 61_000);
    await h.t.mutation(api.portal.touch, { token: linkA.token });
    const link = await h.t.run(async (ctx) => ctx.db.get("accessLinks", linkA.linkId));
    expect(link?.useCount).toBe(2);
  });
});

describe("codice di sblocco dei documenti", () => {
  async function withDocs() {
    const h = await setup();
    const a = await newClient(h, "A");
    const b = await newClient(h, "B");
    const link = await newLink(h, a);
    const linkB = await newLink(h, b);
    const storageId = await h.t.run(async (ctx) => ctx.storage.store(new Blob(["x"])));
    const insertDoc = (clientId: Id<"clients">, title: string, scanStatus: "pending" | "clean" | "rejected", visibleToClient: boolean) =>
      h.t.run(async (ctx) =>
        ctx.db.insert("documents", { clientId, kind: "contract", title, storageId, fileName: `${title}.pdf`, mimeType: "application/pdf", sizeBytes: 10, scanStatus, visibleToClient }),
      );
    await insertDoc(a, "Contratto A", "clean", true);
    await insertDoc(a, "Non scansionato", "pending", true);
    await insertDoc(a, "Respinto", "rejected", true);
    await insertDoc(a, "Nascosto", "clean", false);
    await insertDoc(b, "Contratto B", "clean", true);
    return { h, a, b, link, linkB };
  }

  it("senza codice i documenti sono bloccati", async () => {
    const { h, link } = await withDocs();
    expect(await codeOf(h.t.query(api.portal.documents, { token: link.token, unlockToken: "x".repeat(43) }))).toBe("UNLOCK_REQUIRED");
    expect(await codeOf(h.t.query(api.portal.documents, { token: link.token, unlockToken: "" }))).toBe("UNLOCK_REQUIRED");
  });

  it("con il codice giusto si vedono solo i file puliti e visibili, senza dati interni", async () => {
    const { h, link } = await withDocs();
    const { code } = await issue(h, link.linkId);
    const result = await h.t.mutation(api.otp.verifyCode, { token: link.token, code });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const docs = await h.t.query(api.portal.documents, { token: link.token, unlockToken: result.unlockToken });
    expect(docs.map((d) => d.title)).toEqual(["Contratto A"]);
    const json = JSON.stringify(docs);
    expect(json).not.toContain("storageId");
    expect(json).not.toContain("Contratto B");
  });

  it("il codice non e' salvato in chiaro", async () => {
    const { h, link } = await withDocs();
    const { code } = await issue(h, link.linkId);
    const rows = await h.t.run(async (ctx) => ctx.db.query("otpCodes").collect());
    expect(rows[0].codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(`"${code}"`);
    const logs = await h.t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    expect(JSON.stringify(logs)).not.toContain(`"${code}"`);
  });

  it("la sessione di sblocco di un cliente non apre i documenti di un altro", async () => {
    const { h, link, linkB } = await withDocs();
    const { code } = await issue(h, link.linkId);
    const result = await h.t.mutation(api.otp.verifyCode, { token: link.token, code });
    if (!result.ok) throw new Error("atteso sblocco");
    expect(await codeOf(h.t.query(api.portal.documents, { token: linkB.token, unlockToken: result.unlockToken }))).toBe("UNLOCK_REQUIRED");
  });

  it("5 tentativi errati bloccano il codice, anche se poi si inserisce quello giusto", async () => {
    const { h, link } = await withDocs();
    const { code } = await issue(h, link.linkId);
    const wrong = code === "000000" ? "111111" : "000000";

    const lefts: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await h.t.mutation(api.otp.verifyCode, { token: link.token, code: wrong });
      expect(r.ok).toBe(false);
      if (!r.ok && r.reason === "INVALID_CODE") lefts.push(r.attemptsLeft);
    }
    expect(lefts).toEqual([4, 3, 2, 1]);

    // Quinto errore: blocco.
    const fifth = await h.t.mutation(api.otp.verifyCode, { token: link.token, code: wrong });
    expect(fifth).toEqual({ ok: false, reason: "LOCKED" });

    // CRUCIALE: i tentativi sono davvero salvati (non annullati da un errore).
    const rows = await h.t.run(async (ctx) => ctx.db.query("otpCodes").collect());
    expect(rows[0].attempts).toBe(5);

    // Il codice giusto, ora, non serve piu'.
    expect(await h.t.mutation(api.otp.verifyCode, { token: link.token, code })).toEqual({ ok: false, reason: "LOCKED" });
  });

  it("un codice malformato non consuma tentativi", async () => {
    const { h, link } = await withDocs();
    await issue(h, link.linkId);
    expect(await h.t.mutation(api.otp.verifyCode, { token: link.token, code: "12ab56" })).toEqual({ ok: false, reason: "INVALID_FORMAT" });
    const rows = await h.t.run(async (ctx) => ctx.db.query("otpCodes").collect());
    expect(rows[0].attempts).toBe(0);
  });

  it("il codice scade dopo 10 minuti", async () => {
    const { h, link } = await withDocs();
    const { code } = await issue(h, link.linkId);
    vi.setSystemTime(NOW + 11 * 60 * 1000);
    expect(await h.t.mutation(api.otp.verifyCode, { token: link.token, code })).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("un nuovo codice invalida il precedente", async () => {
    const { h, link } = await withDocs();
    const first = await issue(h, link.linkId);
    let second = await issue(h, link.linkId);
    // Estrema rarita': due codici uguali. In quel caso se ne genera un altro.
    while (second.code === first.code) second = await issue(h, link.linkId);
    expect((await h.t.mutation(api.otp.verifyCode, { token: link.token, code: first.code })).ok).toBe(false);
    expect((await h.t.mutation(api.otp.verifyCode, { token: link.token, code: second.code })).ok).toBe(true);
  });

  it("massimo 3 codici ogni 15 minuti", async () => {
    const { h, link } = await withDocs();
    await issue(h, link.linkId);
    await issue(h, link.linkId);
    await issue(h, link.linkId);
    expect(await codeOf(issue(h, link.linkId))).toBe("RATE_LIMITED");
    vi.setSystemTime(NOW + 16 * 60 * 1000);
    expect(await codeOf(issue(h, link.linkId))).toBe("OK");
  });

  it("revocare il link chiude subito anche la sessione di sblocco", async () => {
    const { h, link } = await withDocs();
    const { code } = await issue(h, link.linkId);
    const result = await h.t.mutation(api.otp.verifyCode, { token: link.token, code });
    if (!result.ok) throw new Error("atteso sblocco");
    await h.admin.mutation(api.accessLinks.revoke, { linkId: link.linkId });
    expect(await codeOf(h.t.query(api.portal.documents, { token: link.token, unlockToken: result.unlockToken }))).toBe("INVALID_LINK");
    const sessions = await h.t.run(async (ctx) => ctx.db.query("unlockSessions").collect());
    expect(sessions).toHaveLength(0);
  });
});

describe("manutenzione periodica", () => {
  it("i link scaduti vengono disattivati", async () => {
    const h = await setup();
    const clientId = await newClient(h, "A");
    const link = await newLink(h, clientId, 1);
    expect(await codeOf(h.t.query(api.portal.overview, { token: link.token }))).toBe("OK");
    vi.setSystemTime(NOW + 2 * DAY);
    // Le query non leggono l'orologio: finche' il lavoro periodico non gira, il link resta attivo.
    await h.t.mutation(internal.maintenance.expireLinks, {});
    expect(await codeOf(h.t.query(api.portal.overview, { token: link.token }))).toBe("INVALID_LINK");
  });

  it("le sessioni di sblocco scadute vengono cancellate", async () => {
    const h = await setup();
    const clientId = await newClient(h, "A");
    const link = await newLink(h, clientId);
    const { code } = await issue(h, link.linkId);
    await h.t.mutation(api.otp.verifyCode, { token: link.token, code });
    vi.setSystemTime(NOW + 31 * 60 * 1000);
    await h.t.mutation(internal.maintenance.expireSessions, {});
    expect(await h.t.run(async (ctx) => ctx.db.query("unlockSessions").collect())).toHaveLength(0);
  });

  it("le fatture inviate oltre la scadenza diventano scadute, e il cliente le vede", async () => {
    const h = await setup();
    const clientId = await newClient(h, "A");
    const invoiceId = await h.admin.mutation(api.invoices.create, { clientId, number: "S1", issuedAt: NOW, dueAt: NOW + DAY, amountCents: 5000 });
    await h.admin.mutation(api.invoices.setStatus, { invoiceId, status: "sent" });
    const link = await newLink(h, clientId);
    vi.setSystemTime(NOW + 2 * DAY);
    await h.t.mutation(internal.maintenance.markOverdueInvoices, {});
    const { billing } = await h.t.query(api.portal.overview, { token: link.token });
    expect(billing.invoices[0].status).toBe("overdue");
    expect(billing.overdueCents).toBe(5000);
    expect(billing.outstandingCents).toBe(5000);
  });
});

describe("amministratore iniziale", () => {
  it("bootstrap e' interno e idempotente", async () => {
    const t = convexTest(schema, modules);
    expect(await t.mutation(internal.admins.bootstrap, { email: "Nuovo@Esempio.it" })).toEqual({ created: true });
    expect(await t.mutation(internal.admins.bootstrap, { email: "nuovo@esempio.it" })).toEqual({ created: false });
    const admins = await t.run(async (ctx) => ctx.db.query("admins").collect());
    expect(admins.map((a) => a.email)).toEqual(["nuovo@esempio.it"]);
  });
});

describe("invio del codice al cliente (richiesta -> email -> sblocco)", () => {
  async function ready() {
    process.env.RESEND_API_KEY = "re_chiave_di_prova";
    process.env.AUTH_EMAIL_FROM = "CORE829 <portal@core829.net>";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const h = await setup();
    const clientId = await newClient(h, "A");
    const link = await newLink(h, clientId);
    return { h, link, fetchMock };
  }
  async function flush(h: Harness) {
    await new Promise((r) => setTimeout(r, 20));
    await h.t.finishInProgressScheduledFunctions();
  }
  const sentBody = (fetchMock: ReturnType<typeof vi.fn>, n = 0) =>
    JSON.parse((fetchMock.mock.calls[n] as [string, RequestInit])[1].body as string) as { to: string[]; text: string; html: string; subject: string };

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.AUTH_EMAIL_FROM;
  });

  it("il cliente chiede il codice, riceve l'email e con quel codice sblocca i documenti", async () => {
    const { h, link, fetchMock } = await ready();
    expect(await h.t.mutation(api.otp.requestCode, { token: link.token })).toEqual({ status: "REQUESTED" });
    await flush(h);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const mail = sentBody(fetchMock);
    expect(mail.to).toEqual(["a@esempio.it"]);
    const code = /\b(\d{6})\b/.exec(mail.text)?.[1];
    expect(code).toBeDefined();
    // L'email non contiene il link del cliente ne' altri segreti.
    expect(JSON.stringify(mail)).not.toContain(link.token);

    const result = await h.t.mutation(api.otp.verifyCode, { token: link.token, code: code! });
    expect(result.ok).toBe(true);
  });

  it("il codice in chiaro non resta salvato da nessuna parte (ne' nei dati ne' negli argomenti pianificati)", async () => {
    const { h, link, fetchMock } = await ready();
    await h.t.mutation(api.otp.requestCode, { token: link.token });
    await flush(h);
    const code = /\b(\d{6})\b/.exec(sentBody(fetchMock).text)![1];
    const everything = await h.t.run(async (ctx) => ({
      otp: await ctx.db.query("otpCodes").collect(),
      audit: await ctx.db.query("auditLogs").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(JSON.stringify(everything)).not.toContain(`"${code}"`);
    expect(JSON.stringify(everything.scheduled)).not.toContain(code);
  });

  it("oltre il limite non parte nessuna email e la risposta lo dice", async () => {
    const { h, link, fetchMock } = await ready();
    for (let i = 0; i < 3; i++) {
      expect(await h.t.mutation(api.otp.requestCode, { token: link.token })).toEqual({ status: "REQUESTED" });
      await flush(h);
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await h.t.mutation(api.otp.requestCode, { token: link.token })).toEqual({ status: "RATE_LIMITED" });
    await flush(h);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("un link non valido viene rifiutato prima di spedire qualsiasi cosa", async () => {
    const { h, fetchMock } = await ready();
    expect(await codeOf(h.t.mutation(api.otp.requestCode, { token: "x".repeat(43) }))).toBe("INVALID_LINK");
    await flush(h);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("senza configurazione email non invia nulla e non rivela l'errore al cliente", async () => {
    const { h, link, fetchMock } = await ready();
    delete process.env.RESEND_API_KEY;
    expect(await h.t.mutation(api.otp.requestCode, { token: link.token })).toEqual({ status: "REQUESTED" });
    await flush(h);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("se Resend rifiuta l'invio, il cliente puo' riprovare (il tentativo conta nel limite)", async () => {
    const { h, link, fetchMock } = await ready();
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await h.t.mutation(api.otp.requestCode, { token: link.token });
    await flush(h);
    await h.t.mutation(api.otp.requestCode, { token: link.token });
    await flush(h);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("pagina del cliente (widget)", () => {
  type W = { id: string; type: string; enabled: boolean; title?: string; body?: string; items?: { label: string; url: string }[] };
  async function twoPages() {
    const h = await setup();
    const a = await newClient(h, "A");
    const b = await newClient(h, "B");
    return { h, a, b, linkA: await newLink(h, a), linkB: await newLink(h, b) };
  }
  const core = (type: string, enabled = true): W => ({ id: type, type, enabled });

  it("senza personalizzazione vale la pagina predefinita, con tutti i blocchi di sistema", async () => {
    const { h, a, linkA } = await twoPages();
    const page = await h.admin.query(api.pages.get, { clientId: a });
    expect(page.isCustom).toBe(false);
    expect(page.widgets.map((w) => w.type)).toEqual(["welcome", "onboarding", "summary", "projects", "billing", "subscriptions", "documents"]);
    const data = await h.t.query(api.portal.overview, { token: linkA.token });
    expect(data.widgets.map((w) => w.type)).toEqual(page.widgets.map((w) => w.type));
  });

  it("il cliente vede solo i blocchi attivi, nell'ordine scelto", async () => {
    const { h, a, linkA } = await twoPages();
    await h.admin.mutation(api.pages.save, {
      clientId: a,
      widgets: [
        core("summary"),
        { id: "avviso-1", type: "notice", enabled: true, title: "Chiusura estiva", body: "Siamo chiusi dal 10 al 20 agosto." },
        core("billing"),
        core("projects", false),
        core("documents"),
      ] as never,
    });
    const data = await h.t.query(api.portal.overview, { token: linkA.token });
    expect(data.widgets.map((w) => w.type)).toEqual(["summary", "notice", "billing", "documents"]);
    expect(JSON.stringify(data.widgets)).not.toContain("projects");
  });

  it("la pagina di un cliente non influenza quella di un altro", async () => {
    const { h, a, linkB } = await twoPages();
    await h.admin.mutation(api.pages.save, {
      clientId: a,
      widgets: [{ id: "avviso-1", type: "notice", enabled: true, title: "SOLO PER A", body: "riservato" }] as never,
    });
    const dataB = await h.t.query(api.portal.overview, { token: linkB.token });
    expect(dataB.widgets.map((w) => w.type)).toContain("projects");
    expect(JSON.stringify(dataB)).not.toContain("SOLO PER A");
  });

  it("rifiuta contenuti non validi: link non https, blocchi doppi, troppi blocchi", async () => {
    const { h, a } = await twoPages();
    // eslint-disable-next-line no-script-url -- input malevolo: il test verifica che venga rifiutato
    const badLink = [{ id: "l", type: "links", enabled: true, title: "Link", items: [{ label: "x", url: "javascript:alert(1)" }] }];
    expect(await codeOf(h.admin.mutation(api.pages.save, { clientId: a, widgets: badLink as never }))).toBe("VALIDATION");
    const twice = [core("projects"), { id: "p2", type: "projects", enabled: true }];
    expect(await codeOf(h.admin.mutation(api.pages.save, { clientId: a, widgets: twice as never }))).toBe("VALIDATION");
    const many = Array.from({ length: 21 }, (_, i) => ({ id: `n${i}`, type: "notice", enabled: true, title: "t", body: "b" }));
    expect(await codeOf(h.admin.mutation(api.pages.save, { clientId: a, widgets: many as never }))).toBe("VALIDATION");
    // Nulla e' stato salvato: resta la pagina predefinita.
    expect((await h.admin.query(api.pages.get, { clientId: a })).isCustom).toBe(false);
  });

  it("un testo con codice HTML viene salvato come semplice testo, senza essere interpretato", async () => {
    const { h, a, linkA } = await twoPages();
    await h.admin.mutation(api.pages.save, {
      clientId: a,
      widgets: [{ id: "n", type: "notice", enabled: true, title: "<img src=x onerror=alert(1)>", body: "<script>alert(1)</script>" }] as never,
    });
    const data = await h.t.query(api.portal.overview, { token: linkA.token });
    expect(data.widgets[0]).toMatchObject({ title: "<img src=x onerror=alert(1)>", body: "<script>alert(1)</script>" });
  });

  it("ripristina la pagina predefinita", async () => {
    const { h, a } = await twoPages();
    await h.admin.mutation(api.pages.save, { clientId: a, widgets: [core("summary")] as never });
    expect((await h.admin.query(api.pages.get, { clientId: a })).isCustom).toBe(true);
    await h.admin.mutation(api.pages.reset, { clientId: a });
    expect((await h.admin.query(api.pages.get, { clientId: a })).isCustom).toBe(false);
  });

  it("l'anteprima mostra le modifiche non salvate e applica le stesse regole di validazione", async () => {
    const { h, a } = await twoPages();
    const draft = [core("billing"), core("summary", false)];
    const preview = await h.admin.query(api.pages.preview, { clientId: a, widgets: draft as never });
    expect(preview?.widgets.map((w) => w.type)).toEqual(["billing"]);
    // Nel frattempo nulla e' stato salvato.
    expect((await h.admin.query(api.pages.get, { clientId: a })).isCustom).toBe(false);
    const bad = [{ id: "l", type: "links", enabled: true, title: "t", items: [{ label: "x", url: "http://non-sicuro.it" }] }];
    expect(await codeOf(h.admin.query(api.pages.preview, { clientId: a, widgets: bad as never }))).toBe("VALIDATION");
  });

  it("il salvataggio finisce nel registro di audit", async () => {
    const { h, a } = await twoPages();
    await h.admin.mutation(api.pages.save, { clientId: a, widgets: [core("summary")] as never });
    const logs = await h.t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    expect(logs.map((l) => l.action)).toContain("page.saved");
  });
});
