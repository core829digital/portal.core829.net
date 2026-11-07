import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { audit } from "./lib/audit";
import { randomDigits, randomToken, timingSafeEqual } from "./lib/crypto";
import { fail, INVALID_LINK_MESSAGE } from "./lib/errors";
import { hashOtp, hashUnlockToken, resolveLink } from "./lib/links";

/**
 * Codice a 6 cifre per sbloccare contratti e fatture.
 *
 * Limiti (insieme impediscono di indovinare il codice):
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

/**
 * Genera un nuovo codice per il link. Funzione INTERNA: restituisce il codice in chiaro solo a chi
 * deve spedirlo via email (Fase 4); non e' raggiungibile dal browser.
 */
export const issueCode = internalMutation({
  args: { linkId: v.id("accessLinks") },
  handler: async (ctx, args) => {
    const link = await ctx.db.get("accessLinks", args.linkId);
    if (!link || !link.active) return fail("INVALID_LINK", INVALID_LINK_MESSAGE);
    const client = await ctx.db.get("clients", link.clientId);
    if (!client) return fail("INVALID_LINK", INVALID_LINK_MESSAGE);

    const now = Date.now();
    const recent = await ctx.db
      .query("otpCodes")
      .withIndex("by_linkId", (q) => q.eq("linkId", args.linkId))
      .order("desc")
      .take(MAX_CODES_PER_DAY + 1);
    const inWindow = recent.filter((c) => c._creationTime > now - WINDOW_MS).length;
    const inDay = recent.filter((c) => c._creationTime > now - DAY_MS).length;
    if (inWindow >= MAX_CODES_PER_WINDOW || inDay >= MAX_CODES_PER_DAY) {
      return fail("RATE_LIMITED", "Troppi codici richiesti. Riprova più tardi.");
    }

    // Un nuovo codice invalida i precedenti.
    for (const old of recent) {
      if (old.consumedAt === undefined) await ctx.db.patch("otpCodes", old._id, { consumedAt: now });
    }

    const code = randomDigits(6);
    const expiresAt = now + CODE_TTL_MS;
    await ctx.db.insert("otpCodes", {
      linkId: args.linkId,
      codeHash: await hashOtp(args.linkId, code),
      expiresAt,
      attempts: 0,
    });
    await audit(ctx, {
      actorType: "client",
      clientId: link.clientId,
      action: "otp.issued",
      resourceType: "accessLink",
      resourceId: args.linkId,
    });
    return { code, expiresAt, email: client.email, displayName: client.displayName };
  },
});

export type VerifyResult =
  | { ok: true; unlockToken: string; expiresAt: number }
  | { ok: false; reason: "INVALID_FORMAT" | "EXPIRED" | "LOCKED" }
  | { ok: false; reason: "INVALID_CODE"; attemptsLeft: number };

/**
 * Verifica il codice e, se corretto, apre una sessione di sblocco di 30 minuti.
 *
 * ATTENZIONE: i tentativi falliti NON lanciano errori ma restituiscono un risultato. In Convex un errore
 * annulla tutte le scritture della mutazione: se qui lanciassimo dopo aver incrementato `attempts`,
 * l'incremento sparirebbe e si potrebbe provare all'infinito.
 */
export const verifyCode = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, args): Promise<VerifyResult> => {
    // Link non valido: errore (nessuna scrittura da annullare).
    const link = await resolveLink(ctx, args.token);

    const code = args.code.trim();
    if (!/^[0-9]{6}$/.test(code)) return { ok: false, reason: "INVALID_FORMAT" };

    const now = Date.now();
    const latest = await ctx.db
      .query("otpCodes")
      .withIndex("by_linkId", (q) => q.eq("linkId", link._id))
      .order("desc")
      .first();
    if (!latest || latest.consumedAt !== undefined || latest.expiresAt <= now) {
      return { ok: false, reason: "EXPIRED" };
    }
    if (latest.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "LOCKED" };

    const given = await hashOtp(link._id, code);
    if (!timingSafeEqual(latest.codeHash, given)) {
      const attempts = latest.attempts + 1;
      await ctx.db.patch("otpCodes", latest._id, { attempts });
      await audit(ctx, {
        actorType: "client",
        clientId: link.clientId,
        action: "otp.failed",
        resourceType: "accessLink",
        resourceId: link._id,
        metadata: { attempts },
      });
      if (attempts >= MAX_ATTEMPTS) return { ok: false, reason: "LOCKED" };
      return { ok: false, reason: "INVALID_CODE", attemptsLeft: MAX_ATTEMPTS - attempts };
    }

    await ctx.db.patch("otpCodes", latest._id, { consumedAt: now });
    const unlockToken = randomToken();
    const expiresAt = now + UNLOCK_TTL_MS;
    await ctx.db.insert("unlockSessions", {
      linkId: link._id,
      tokenHash: await hashUnlockToken(unlockToken),
      expiresAt,
    });
    await audit(ctx, {
      actorType: "client",
      clientId: link.clientId,
      action: "otp.verified",
      resourceType: "accessLink",
      resourceId: link._id,
    });
    return { ok: true, unlockToken, expiresAt };
  },
});
