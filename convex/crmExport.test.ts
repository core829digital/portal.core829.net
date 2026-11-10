/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const asUser = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId}|s`, issuer: "https://test.local", tokenIdentifier: `https://test.local|${userId}|s` });

describe("esportazione per il CRM", () => {
  it("solo amministratori; contiene clienti, progetti, fatture, abbonamenti; mai le note interne", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert("admins", { email: "stefan@core829.net", addedAt: 1 }));
    const admin = asUser(t, await t.run((ctx) => ctx.db.insert("users", { email: "stefan@core829.net", emailVerificationTime: 1 })));
    const stranger = asUser(t, await t.run((ctx) => ctx.db.insert("users", { email: "x@y.it", emailVerificationTime: 1 })));
    await t.run(async (ctx) => {
      const c = await ctx.db.insert("clients", { displayName: "Studio", contactName: "Mario Rossi", email: "m@r.it", packageType: "standard", status: "active", internalNotes: "SEGRETO" });
      const p = await ctx.db.insert("projects", { clientId: c, name: "Sito", status: "in_progress", progress: 10 });
      await ctx.db.insert("invoices", { clientId: c, projectId: p, number: "1", issuedAt: 1, dueAt: 2, amountCents: 100, currency: "EUR", status: "sent", visibleToClient: true });
      await ctx.db.insert("subscriptions", { clientId: c, name: "Hosting", amountCents: 5, currency: "EUR", interval: "month", status: "active", startedAt: 1 });
    });
    await expect(stranger.query(api.crmExport.snapshot, {})).rejects.toThrow();
    const out = await admin.query(api.crmExport.snapshot, {});
    expect(out.clients).toHaveLength(1);
    expect(out.clients[0]).toMatchObject({ contactName: "Mario Rossi" });
    expect(out.clients[0].projects).toHaveLength(1);
    expect(out.clients[0].invoices[0].projectRef).toBe(out.clients[0].projects[0].ref);
    expect(out.clients[0].subscriptions).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain("SEGRETO");
  });
});
