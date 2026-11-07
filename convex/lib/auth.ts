import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail } from "./errors";

/**
 * Controllo di accesso dell'amministratore.
 *
 * L'identita' arriva dal provider di login (JWT verificato da Convex). L'autorizzazione NON dipende
 * da nulla che il client possa scegliere: si legge l'identita' lato server e si confronta con la
 * tabella `admins`. Va chiamata come PRIMA istruzione di ogni funzione amministrativa.
 */
export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return fail("UNAUTHENTICATED", "Accesso richiesto.");

  const email = typeof identity.email === "string" ? identity.email.trim().toLowerCase() : "";
  // Un'email non verificata non basta: chiunque potrebbe dichiararla.
  if (email === "" || identity.emailVerified === false) return fail("FORBIDDEN", "Non autorizzato.");

  const admin = await ctx.db
    .query("admins")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  if (!admin) return fail("FORBIDDEN", "Non autorizzato.");

  return { admin, actorId: identity.tokenIdentifier };
}
