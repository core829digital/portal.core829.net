import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail } from "./errors";

export type TeamRole = "admin" | "agent";

export type AdminLookup =
  | { status: "anonymous" }
  | { status: "forbidden" }
  | { status: "admin"; admin: Doc<"admins">; actorId: string; role: TeamRole };

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
  return { status: "admin", admin, actorId: userId, role: admin.role ?? "admin" };
}

/**
 * Controllo di accesso dell'amministratore. Va chiamata come PRIMA istruzione di ogni funzione
 * amministrativa. L'identita' si legge lato server: non dipende mai da un argomento scelto dal client.
 */
export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const result = await lookupAdmin(ctx);
  if (result.status === "anonymous") return fail("UNAUTHENTICATED", "Accesso richiesto.");
  if (result.status === "forbidden") return fail("FORBIDDEN", "Non autorizzato.");
  // Gli agenti commerciali non sono amministratori: il portale resta chiuso per loro.
  if (result.role !== "admin") return fail("FORBIDDEN", "Non autorizzato.");
  return { admin: result.admin, actorId: result.actorId };
}

/**
 * Accesso del team: amministratori E agenti commerciali. Serve solo alle funzioni del CRM.
 * Restituisce anche il nome da mostrare (per "assegnato a", chat, log): si legge dal server, mai dal client.
 */
export async function requireTeam(ctx: QueryCtx | MutationCtx) {
  const result = await lookupAdmin(ctx);
  if (result.status === "anonymous") return fail("UNAUTHENTICATED", "Accesso richiesto.");
  if (result.status === "forbidden") return fail("FORBIDDEN", "Non autorizzato.");
  return { admin: result.admin, actorId: result.actorId, role: result.role, name: result.admin.name ?? result.admin.email };
}
