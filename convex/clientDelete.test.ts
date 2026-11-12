/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
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

async function seedClient(t: ReturnType<typeof convexTest>, name: string, projects = 2) {
  return await t.run(async (ctx) => {
    const clientId = await ctx.db.insert("clients", {
      displayName: name, contactName: "Ref", email: `${name.toLowerCase().replace(/\W/g, "")}@x.it`, status: "active", packageType: "standard",
    } as never);
    const storageId = await ctx.storage.store(new Blob(["pdf"]));
    const documentId = await ctx.db.insert("documents", {
      clientId, kind: "contract", title: "Doc", storageId, fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 3, scanStatus: "clean", visibleToClient: true,
    } as never);
    let projectId: Id<"projects"> | undefined;
    for (let i = 0; i < projects; i++) {
      projectId = await ctx.db.insert("projects", { clientId, name: `P${i}`, status: "in_progress", progress: 0 } as never);
      await ctx.db.insert("projectUpdates", { projectId, clientId, title: "u", body: "b", visibleToClient: true });
    }
    const subscriptionId = await ctx.db.insert("subscriptions", { clientId, name: "S", amountCents: 100, currency: "EUR", interval: "month", status: "active", startedAt: 1 } as never);
    await ctx.db.insert("invoices", { clientId, subscriptionId, documentId, number: `N-${name}`, issuedAt: 1, dueAt: 2, amountCents: 100, currency: "EUR", status: "sent", visibleToClient: true } as never);
    const ticketId = await ctx.db.insert("tickets", { clientId, subject: "s", category: "question", status: "open", createdAt: 1, lastMessageAt: 1, lastMessageBy: "client", messageCount: 1 });
    await ctx.db.insert("ticketMessages", { ticketId, clientId, author: "client", body: "hi", createdAt: 1 });
    await ctx.db.insert("deadlines", { title: "d", dueAt: 5, clientId, category: "other", done: false });
    await ctx.db.insert("accessLinks", { clientId, tokenHash: `h-${name}`, active: true, prefix: "abcd", expiresAt: 9, useCount: 0 });
    await ctx.db.insert("notifications", { kind: "k", audience: "client", clientId, to: "a@b.it", subject: "s", heading: "h", body: "b", status: "sent", createdAt: 1 });
    return { clientId, storageId };
  });
}

describe("eliminazione cliente", () => {
  it("solo l'admin; serve il nome esatto", async () => {
    const { t, admin, stranger } = await setup();
    const { clientId } = await seedClient(t, "Acme Srl");
    await expect(stranger.mutation(api.clients.remove, { clientId, confirmName: "Acme Srl" })).rejects.toThrow();
    await expect(admin.mutation(api.clients.remove, { clientId, confirmName: "acme" })).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.get("clients", clientId))).not.toBeNull();
  });

  it("cancella tutto del cliente (file inclusi), lascia intatti gli altri e scrive l'audit", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { t, admin } = await setup();
    const a = await seedClient(t, "Acme Srl", 3);
    const b = await seedClient(t, "Beta Spa", 1);
    await admin.mutation(api.clients.remove, { clientId: a.clientId, confirmName: "Acme Srl" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const left = await t.run(async (ctx) => {
      const by = async (table: "projects" | "documents" | "invoices" | "subscriptions" | "tickets" | "ticketMessages" | "deadlines" | "accessLinks" | "notifications" | "projectUpdates", id: Id<"clients">) =>
        (await ctx.db.query(table).collect()).filter((r) => (r as { clientId?: Id<"clients"> }).clientId === id).length;
      const tables = ["projects", "documents", "invoices", "subscriptions", "tickets", "ticketMessages", "deadlines", "accessLinks", "notifications", "projectUpdates"] as const;
      const counts: Record<string, number[]> = {};
      for (const tb of tables) counts[tb] = [await by(tb, a.clientId), await by(tb, b.clientId)];
      return {
        counts,
        clientA: await ctx.db.get("clients", a.clientId),
        clientB: await ctx.db.get("clients", b.clientId),
        fileA: await ctx.storage.getUrl(a.storageId),
        fileB: await ctx.storage.getUrl(b.storageId),
        audits: (await ctx.db.query("auditLogs").collect()).map((l) => l.action),
      };
    });
    for (const [tb, [gone, kept]] of Object.entries(left.counts)) {
      expect(gone, tb).toBe(0);
      expect(kept, tb).toBeGreaterThan(0);
    }
    expect(left.clientA).toBeNull();
    expect(left.clientB).not.toBeNull();
    expect(left.fileA).toBeNull();
    expect(left.fileB).not.toBeNull();
    expect(left.audits).toContain("client.delete_started");
    expect(left.audits).toContain("client.deleted");
    vi.useRealTimers();
  });

  it("molti dati: la cancellazione prosegue a lotti fino alla fine", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { t, admin } = await setup();
    const { clientId } = await seedClient(t, "Grande Srl", 1);
    await t.run(async (ctx) => {
      for (let i = 0; i < 450; i++) await ctx.db.insert("deadlines", { title: `d${i}`, dueAt: i, clientId, category: "other", done: false });
    });
    await admin.mutation(api.clients.remove, { clientId, confirmName: "Grande Srl" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.get("clients", clientId))).toBeNull();
    expect(await t.run(async (ctx) => (await ctx.db.query("deadlines").collect()).length)).toBe(0);
    vi.useRealTimers();
  });

  it("un cliente in eliminazione non si modifica né si elimina due volte", async () => {
    const { t, admin } = await setup();
    const { clientId } = await seedClient(t, "Acme Srl");
    await admin.mutation(api.clients.remove, { clientId, confirmName: "Acme Srl" });
    await expect(admin.mutation(api.clients.update, { clientId, displayName: "Altro" })).rejects.toThrow();
    await expect(admin.mutation(api.clients.remove, { clientId, confirmName: "Acme Srl" })).rejects.toThrow();
  });
});
