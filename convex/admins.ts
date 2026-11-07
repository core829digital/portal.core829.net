import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { cleanEmail } from "./lib/text";

/** Dice all'interfaccia se l'utente collegato e' un amministratore. Non lancia errori per chi non lo e'. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const email = typeof identity?.email === "string" ? identity.email.trim().toLowerCase() : "";
    if (!identity || email === "" || identity.emailVerified === false) return { isAdmin: false };
    const admin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    return { isAdmin: admin !== null };
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
