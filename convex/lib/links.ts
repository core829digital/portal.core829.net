import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isWellFormedToken, sha256Hex, timingSafeEqual } from "./crypto";
import { fail, INVALID_LINK_MESSAGE } from "./errors";

/** Separa gli hash dei link da quelli di altri usi dello stesso algoritmo. */
export function hashLinkToken(token: string): Promise<string> {
  return sha256Hex(`portal-link:${token}`);
}

export function hashUnlockToken(token: string): Promise<string> {
  return sha256Hex(`portal-unlock:${token}`);
}

/** L'hash del codice e' legato al link: lo stesso codice su un altro link darebbe un hash diverso. */
export function hashOtp(linkId: string, code: string): Promise<string> {
  return sha256Hex(`portal-otp:${linkId}:${code}`);
}

/**
 * Trova il link a partire dal token ricevuto dal browser.
 * Qualunque motivo di rifiuto (malformato, inesistente, revocato, scaduto, cliente mancante)
 * produce lo stesso errore. Non legge l'orologio: la scadenza e' applicata da `maintenance.expireLinks`.
 */
export async function resolveLink(ctx: QueryCtx | MutationCtx, token: unknown): Promise<Doc<"accessLinks">> {
  if (!isWellFormedToken(token)) return fail("INVALID_LINK", INVALID_LINK_MESSAGE);
  const tokenHash = await hashLinkToken(token);
  const link = await ctx.db
    .query("accessLinks")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!link || !link.active) return fail("INVALID_LINK", INVALID_LINK_MESSAGE);
  const client = await ctx.db.get("clients", link.clientId);
  if (!client) return fail("INVALID_LINK", INVALID_LINK_MESSAGE);
  return link;
}

/**
 * Verifica che esista una sessione di sblocco valida per QUESTO link.
 * Le sessioni scadute vengono cancellate da `maintenance.expireSessions`.
 */
export async function requireUnlock(
  ctx: QueryCtx | MutationCtx,
  link: Doc<"accessLinks">,
  unlockToken: unknown,
): Promise<void> {
  if (!isWellFormedToken(unlockToken)) return fail("UNLOCK_REQUIRED", "Inserisci il codice ricevuto via email.");
  const tokenHash = await hashUnlockToken(unlockToken);
  const session = await ctx.db
    .query("unlockSessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!session || !timingSafeEqual(session.linkId, link._id)) {
    return fail("UNLOCK_REQUIRED", "Inserisci il codice ricevuto via email.");
  }
}
