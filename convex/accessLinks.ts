import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { randomToken } from "./lib/crypto";
import { fail } from "./lib/errors";
import { hashLinkToken } from "./lib/links";
import { assertIntInRange, cleanText } from "./lib/text";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVE_LINKS_PER_CLIENT = 5;

/**
 * Crea il link personale del cliente. Il token in chiaro viene restituito UNA SOLA VOLTA,
 * qui: nel database resta solo il suo hash, quindi non e' piu' recuperabile. Per un nuovo link
 * se ne crea un altro e si revoca il vecchio.
 */
export const create = mutation({
  args: { clientId: v.id("clients"), label: v.optional(v.string()), ttlDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const client = await ctx.db.get("clients", args.clientId);
    if (!client) return fail("NOT_FOUND", "Cliente non trovato.");

    const ttlDays = assertIntInRange(args.ttlDays ?? 90, 1, 365, "durata");
    const activeLinks = await ctx.db
      .query("accessLinks")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(50);
    if (activeLinks.filter((l) => l.active).length >= MAX_ACTIVE_LINKS_PER_CLIENT) {
      return fail("CONFLICT", "Troppi link attivi per questo cliente: revocane uno prima.");
    }

    const token = randomToken();
    const now = Date.now();
    const expiresAt = now + ttlDays * DAY_MS;
    const linkId = await ctx.db.insert("accessLinks", {
      clientId: args.clientId,
      tokenHash: await hashLinkToken(token),
      active: true,
      prefix: token.slice(0, 4),
      label: args.label === undefined ? undefined : cleanText(args.label, { field: "etichetta", max: 60 }),
      expiresAt,
      useCount: 0,
    });
    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: args.clientId,
      action: "access_link.created",
      resourceType: "accessLink",
      resourceId: linkId,
      metadata: { ttlDays },
    });
    return { linkId, token, expiresAt };
  },
});

export const revoke = mutation({
  args: { linkId: v.id("accessLinks") },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const link = await ctx.db.get("accessLinks", args.linkId);
    if (!link) return fail("NOT_FOUND", "Link non trovato.");
    if (!link.active) return null;

    await ctx.db.patch("accessLinks", args.linkId, { active: false, revokedAt: Date.now() });
    // Chiude subito anche le sessioni di sblocco gia' aperte da questo link.
    const sessions = await ctx.db
      .query("unlockSessions")
      .withIndex("by_linkId", (q) => q.eq("linkId", args.linkId))
      .take(100);
    for (const session of sessions) await ctx.db.delete("unlockSessions", session._id);

    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: link.clientId,
      action: "access_link.revoked",
      resourceType: "accessLink",
      resourceId: args.linkId,
    });
    return null;
  },
});

/** Elenco dei link di un cliente. Non contiene mai il token ne' il suo hash. */
export const listByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const links = await ctx.db
      .query("accessLinks")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(50);
    return links.map((l) => ({
      linkId: l._id,
      label: l.label ?? null,
      prefix: l.prefix,
      active: l.active,
      expiresAt: l.expiresAt,
      revokedAt: l.revokedAt ?? null,
      lastUsedAt: l.lastUsedAt ?? null,
      useCount: l.useCount,
    }));
  },
});
