import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { lookupAdmin } from "./lib/auth";
import { cleanEmail } from "./lib/text";

/** Dice all'interfaccia se l'utente collegato e' un amministratore. Non lancia errori per chi non lo e'. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const result = await lookupAdmin(ctx);
    if (result.status !== "admin") return { isAdmin: false, isTeam: false, role: null, name: null };
    return { isAdmin: result.role === "admin", isTeam: true, role: result.role, name: result.admin.name ?? result.admin.email };
  },
});

/**
 * Registra il primo amministratore. Funzione INTERNA: non e' raggiungibile dal browser,
 * si lancia solo da terminale con la chiave di amministrazione:
 *   npx convex run admins:bootstrap '{"email":"nome@dominio.it"}'
 */
export const bootstrap = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = cleanEmail(args.email);
    const existing = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) return { created: false };
    await ctx.db.insert("admins", { email, addedAt: Date.now() });
    await audit(ctx, { actorType: "system", action: "admin.bootstrapped", metadata: { email } });
    return { created: true };
  },
});

/** Per l'accesso: l'indirizzo e' di un membro del team (admin o agente)? Solo uso interno. */
export const isTeamEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const email = args.email.trim().toLowerCase();
    if (email === "" || email.length > 254) return false;
    const row = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    return row !== null;
  },
});
