import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";

/**
 * Firma e timbro di CORE829: caricati dall'amministratore e conservati nell'archivio privato di Convex.
 * Solo il server li legge (per metterli nei documenti in uscita); l'anteprima e' visibile solo all'amministratore.
 */
const kindValidator = v.union(v.literal("stamp"), v.literal("signature"));

export const uploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const status = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("brandAssets").take(10);
    const out: Record<"stamp" | "signature", { url: string | null; width: number; height: number; updatedAt: number } | null> = { stamp: null, signature: null };
    for (const r of rows) out[r.kind] = { url: await ctx.storage.getUrl(r.storageId), width: r.width, height: r.height, updatedAt: r.updatedAt };
    return out;
  },
});

/** Solo per le azioni del server: gli ID dei file di firma e timbro. */
export const assetIds = internalQuery({
  args: {},
  handler: async (ctx): Promise<{ stamp: Id<"_storage"> | null; signature: Id<"_storage"> | null }> => {
    const rows = await ctx.db.query("brandAssets").take(10);
    return { stamp: rows.find((r) => r.kind === "stamp")?.storageId ?? null, signature: rows.find((r) => r.kind === "signature")?.storageId ?? null };
  },
});

export const setAsset = internalMutation({
  args: { kind: kindValidator, storageId: v.id("_storage"), sizeBytes: v.number(), width: v.number(), height: v.number(), actorId: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const existing = await ctx.db
      .query("brandAssets")
      .withIndex("by_kind", (q) => q.eq("kind", args.kind))
      .unique();
    const row = { kind: args.kind, storageId: args.storageId, sizeBytes: args.sizeBytes, width: args.width, height: args.height, updatedAt: Date.now(), updatedBy: args.actorId };
    if (existing) {
      await ctx.storage.delete(existing.storageId);
      await ctx.db.replace("brandAssets", existing._id, row);
    } else await ctx.db.insert("brandAssets", row);
    await audit(ctx, { actorType: "admin", actorId: args.actorId, action: "brand.asset_set", resourceType: "brandAsset", metadata: { kind: args.kind, sizeBytes: args.sizeBytes } });
    return null;
  },
});

export const remove = mutation({
  args: { kind: kindValidator },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const row = await ctx.db
      .query("brandAssets")
      .withIndex("by_kind", (q) => q.eq("kind", args.kind))
      .unique();
    if (!row) return fail("NOT_FOUND", "Nessun file da eliminare.");
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete("brandAssets", row._id);
    await audit(ctx, { actorType: "admin", actorId, action: "brand.asset_removed", resourceType: "brandAsset", metadata: { kind: args.kind } });
    return null;
  },
});
