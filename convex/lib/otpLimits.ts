import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Limiti sui codici di sblocco (insieme impediscono di indovinarli):
 *  - ogni codice vale 10 minuti e ammette 5 tentativi errati;
 *  - massimo 3 codici ogni 15 minuti e 10 al giorno per link;
 *  - quindi al massimo ~50 tentativi al giorno su 1.000.000 di combinazioni.
 */
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const UNLOCK_TTL_MS = 30 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CODES_PER_WINDOW = 3;
const MAX_CODES_PER_DAY = 10;

/** Codici recenti del link (dal piu' nuovo) e se si e' arrivati al limite di emissione. */
export async function recentCodes(
  ctx: Pick<MutationCtx, "db">,
  linkId: Id<"accessLinks">,
  now: number,
): Promise<{ recent: Doc<"otpCodes">[]; limited: boolean }> {
  const recent = await ctx.db
    .query("otpCodes")
    .withIndex("by_linkId", (q) => q.eq("linkId", linkId))
    .order("desc")
    .take(MAX_CODES_PER_DAY + 1);
  const inWindow = recent.filter((c) => c._creationTime > now - WINDOW_MS).length;
  const inDay = recent.filter((c) => c._creationTime > now - DAY_MS).length;
  return { recent, limited: inWindow >= MAX_CODES_PER_WINDOW || inDay >= MAX_CODES_PER_DAY };
}
