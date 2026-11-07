import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail } from "./errors";

export type AdminLookup =
  | { status: "anonymous" }
  | { status: "forbidden" }
  | { status: "admin"; admin: Doc<"admins">; actorId: string };

/**
 * Chi e' l'utente collegato e se e' un amministratore, senza lanciare errori.
 *
 * Il token di accesso di Convex Auth NON contiene l'email: si legge l'utente dalla tabella `users`.
 * Perche' conti come amministratore servono TRE cose:
 *  1. una sessione valida;
 *  2. un'email gia' VERIFICATA con il codice ricevuto (`emailVerificationTime`);
 *  3. quell'email presente nella tabella `admins`.
 */
export async function lookupAdmin(ctx: QueryCtx | MutationCtx): Promise<AdminLookup> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return { status: "anonymous" };

  const user = await ctx.db.get("users", userId);
  const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!user || email === "" || user.emailVerificationTime === undefined) return { status: "forbidden" };

  const admin = await ctx.db
    .query("admins")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  if (!admin) return { status: "forbidden" };
  return { status: "admin", admin, actorId: userId };
}

/**
 * Controllo di accesso dell'amministratore. Va chiamata come PRIMA istruzione di ogni funzione
 * amministrativa. L'identita' si legge lato server: non dipende mai da un argomento scelto dal client.
 */
export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const result = await lookupAdmin(ctx);
  if (result.status === "anonymous") return fail("UNAUTHENTICATED", "Accesso richiesto.");
  if (result.status === "forbidden") return fail("FORBIDDEN", "Non autorizzato.");
  return { admin: result.admin, actorId: result.actorId };
}
