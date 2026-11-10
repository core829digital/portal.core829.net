/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.UTC(2026, 10, 20, 10, 0, 0);
const asUser = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId}|s`, issuer: "https://test.local", tokenIdentifier: `https://test.local|${userId}|s` });
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { data?: { code?: string } }).data?.code ?? String(e).slice(0, 60);
  }
};

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: "stefan@core829.net", addedAt: 1 }));
  const mk = (email: string) => t.run((ctx) => ctx.db.insert("users", { email, emailVerificationTime: 1 }));
  const admin = asUser(t, await mk("stefan@core829.net"));
  const stranger = asUser(t, await mk("x@y.it"));
  const client = (n: string) => t.run((ctx) => ctx.db.insert("clients", { displayName: n, contactName: n, email: `${n}@e.it`, packageType: "standard", status: "active" }));
  const a = await client("a");
  const b = await client("b");
  const doc = (clientId: Id<"clients">, over: Record<string, unknown> = {}) =>
    t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["%PDF-1.4"]));
      return ctx.db.insert("documents", { clientId, kind: "invoice", title: "Fattura", storageId, fileName: "f.pdf", mimeType: "application/pdf", sizeBytes: 8, scanStatus: "clean", visibleToClient: false, ...over } as never);
    });
  const inv = (clientId: Id<"clients">, number: string, status: "draft" | "sent" | "paid" = "draft") =>
    t.run((ctx) => ctx.db.insert("invoices", { clientId, number, issuedAt: NOW, dueAt: NOW + 86_400_000, amountCents: 100, currency: "EUR", status, visibleToClient: true }));
  return { t, admin, stranger, a, b, doc, inv };
}

describe("PDF della fattura", () => {
  it("si allega anche a una fattura gia' pagata, si sostituisce e si stacca senza cancellare il file", async () => {
    const h = await setup();
    const i = await h.inv(h.a, "1", "paid");
    const d1 = await h.doc(h.a);
    const d2 = await h.doc(h.a);
    await h.admin.mutation(api.invoices.attachDocument, { invoiceId: i, documentId: d1 });
    expect((await h.admin.query(api.invoices.listByClient, { clientId: h.a }))[0]).toMatchObject({ documentId: d1, pdfStatus: "clean" });
    await h.admin.mutation(api.invoices.attachDocument, { invoiceId: i, documentId: d2 });
    expect((await h.t.run((ctx) => ctx.db.get(i)))?.documentId).toBe(d2);
    await h.admin.mutation(api.invoices.attachDocument, { invoiceId: i, documentId: null });
    expect((await h.t.run((ctx) => ctx.db.get(i)))?.documentId).toBeUndefined();
    expect(await h.t.run((ctx) => ctx.db.get(d2))).not.toBeNull(); // il file resta nei Documenti
  });

  it("rifiuta file di un altro cliente, non PDF o rifiutati dal controllo; e chi non e' admin", async () => {
    const h = await setup();
    const i = await h.inv(h.a, "2");
    expect(await code(h.admin.mutation(api.invoices.attachDocument, { invoiceId: i, documentId: await h.doc(h.b) }))).toBe("NOT_FOUND");
    expect(await code(h.admin.mutation(api.invoices.attachDocument, { invoiceId: i, documentId: await h.doc(h.a, { mimeType: "image/png", fileName: "f.png" }) }))).toBe("BAD_STATE");
    expect(await code(h.admin.mutation(api.invoices.attachDocument, { invoiceId: i, documentId: await h.doc(h.a, { scanStatus: "rejected" }) }))).toBe("BAD_STATE");
    expect(await code(h.stranger.mutation(api.invoices.attachDocument, { invoiceId: i, documentId: await h.doc(h.a) }))).not.toBe("OK");
  });

  it("inviando la fattura al cliente, il PDF diventa visibile nei suoi Documenti (e il portale lo segnala)", async () => {
    const h = await setup();
    const i = await h.inv(h.a, "3", "draft");
    const d = await h.doc(h.a, { visibleToClient: false });
    await h.admin.mutation(api.invoices.attachDocument, { invoiceId: i, documentId: d });
    await h.admin.mutation(api.invoices.setStatus, { invoiceId: i, status: "sent" });
    expect((await h.t.run((ctx) => ctx.db.get(d)))?.visibleToClient).toBe(true);
    const overview = await h.t.run(async (ctx) => {
      const { buildOverview } = await import("./lib/overview");
      return (await buildOverview(ctx, h.a))?.billing.invoices.map((x) => x.hasPdf);
    });
    expect(overview).toEqual([true]);
  });

  it("fattura nascosta al cliente: il PDF resta nascosto", async () => {
    const h = await setup();
    const i = await h.t.run((ctx) => ctx.db.insert("invoices", { clientId: h.a, number: "4", issuedAt: NOW, dueAt: NOW, amountCents: 1, currency: "EUR", status: "draft", visibleToClient: false }));
    const d = await h.doc(h.a);
    await h.admin.mutation(api.invoices.attachDocument, { invoiceId: i, documentId: d });
    await h.admin.mutation(api.invoices.setStatus, { invoiceId: i, status: "sent" });
    expect((await h.t.run((ctx) => ctx.db.get(d)))?.visibleToClient).toBe(false);
  });

  it("eliminare il documento stacca il PDF dalla fattura (che resta)", async () => {
    const h = await setup();
    const i = await h.inv(h.a, "5", "sent");
    const d = await h.doc(h.a);
    await h.admin.mutation(api.invoices.attachDocument, { invoiceId: i, documentId: d });
    await h.admin.mutation(api.documents.remove, { documentId: d });
    const row = await h.t.run((ctx) => ctx.db.get(i));
    expect(row).not.toBeNull();
    expect(row?.documentId).toBeUndefined();
  });
});
