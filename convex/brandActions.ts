"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, type ActionCtx } from "./_generated/server";
import { MAX_BRAND_PNG_BYTES, MAX_BRAND_PX, pngSize, type Brand } from "./lib/brandSeal";
import { invalid } from "./lib/text";

/** Registra la firma o il timbro appena caricati, dopo aver controllato che siano davvero PNG ragionevoli. */
export const register = action({
  args: { kind: v.union(v.literal("stamp"), v.literal("signature")), storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await ctx.runQuery(internal.docStudio.assertAdmin, {}); // prima di tutto: chi non e' admin non cancella nulla
    try {
      const blob = await ctx.storage.get(args.storageId);
      if (!blob) return invalid("file", "File non trovato.");
      if (blob.size > MAX_BRAND_PNG_BYTES) return invalid("file", "Il file supera i 2 MB.");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const size = pngSize(bytes);
      if (!size) return invalid("file", "Serve un'immagine PNG (meglio con sfondo trasparente).");
      if (size.width > MAX_BRAND_PX || size.height > MAX_BRAND_PX) return invalid("file", `L'immagine supera ${MAX_BRAND_PX} pixel per lato.`);
      await ctx.runMutation(internal.brand.setAsset, { kind: args.kind, storageId: args.storageId, sizeBytes: bytes.length, width: size.width, height: size.height, actorId });
      return null;
    } catch (error) {
      // Se non e' stato registrato, il file caricato non resta in archivio.
      const ids = await ctx.runQuery(internal.brand.assetIds, {});
      if (ids.stamp !== args.storageId && ids.signature !== args.storageId) await ctx.storage.delete(args.storageId).catch(() => undefined);
      throw error;
    }
  },
});

/** Firma e timbro come byte, per i documenti in uscita. Mancano? Il documento esce senza (il pannello Firma e timbro lo segnala). */
export async function loadBrand(ctx: Pick<ActionCtx, "runQuery" | "storage">): Promise<Brand> {
  const ids = await ctx.runQuery(internal.brand.assetIds, {});
  const read = async (id: Id<"_storage"> | null) => {
    if (!id) return undefined;
    const blob = await ctx.storage.get(id);
    return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
  };
  return { signature: await read(ids.signature), stamp: await read(ids.stamp) };
}
