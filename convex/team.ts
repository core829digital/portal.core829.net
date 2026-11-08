import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin, requireTeam } from "./lib/auth";
import { fail } from "./lib/errors";
import { cleanEmail, cleanText } from "./lib/text";

/** Gestione del team: l'amministratore aggiunge e toglie gli agenti commerciali (accesso solo al CRM). */

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("admins").take(200);
    return rows.map((r) => ({ id: r._id, email: r.email, name: r.name ?? null, role: r.role ?? "admin", addedAt: r.addedAt }));
  },
});

/** Nomi dei colleghi, per "assegnato a", chat e filtri del CRM. Aperta a tutto il team, senza email. */
export const members = query({
  args: {},
  handler: async (ctx) => {
    await requireTeam(ctx);
    const rows = await ctx.db.query("admins").take(200);
    return rows.map((r) => ({ id: r._id, name: r.name ?? r.email.split("@")[0], role: r.role ?? "admin" }));
  },
});

export const addAgent = mutation({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const email = cleanEmail(args.email);
    const name = cleanText(args.name, { field: "nome", min: 2, max: 80 });
    const existing = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) return fail("CONFLICT", "Questa email fa già parte del team.");
    await ctx.db.insert("admins", { email, name, role: "agent", addedAt: Date.now() });
    await audit(ctx, { actorType: "admin", actorId, action: "team.agent_added", resourceType: "admin", metadata: { email } });
    return null;
  },
});

export const rename = mutation({
  args: { memberId: v.id("admins"), name: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const row = await ctx.db.get("admins", args.memberId);
    if (!row) return fail("NOT_FOUND", "Membro non trovato.");
    await ctx.db.patch("admins", row._id, { name: cleanText(args.name, { field: "nome", min: 2, max: 80 }) });
    await audit(ctx, { actorType: "admin", actorId, action: "team.renamed", resourceType: "admin", resourceId: row._id });
    return null;
  },
});

/** Si possono togliere solo gli agenti: gli amministratori si gestiscono da terminale (admins:bootstrap). */
export const removeAgent = mutation({
  args: { memberId: v.id("admins") },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const row = await ctx.db.get("admins", args.memberId);
    if (!row) return fail("NOT_FOUND", "Membro non trovato.");
    if ((row.role ?? "admin") !== "agent") return fail("BAD_STATE", "Gli amministratori non si eliminano da qui.");
    await ctx.db.delete("admins", row._id);
    await audit(ctx, { actorType: "admin", actorId, action: "team.agent_removed", resourceType: "admin", metadata: { email: row.email } });
    return null;
  },
});
