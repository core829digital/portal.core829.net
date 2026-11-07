import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";

/**
 * Gestione amministrativa dei documenti. Il caricamento dei file (URL firmati, controllo del
 * contenuto, scansione) arriva nella Fase 6: qui ci sono solo elenco e visibilita'.
 * Mai restituire `storageId` al cliente.
 */
export const listByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("documents")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(200);
  },
});

export const setVisibility = mutation({
  args: { documentId: v.id("documents"), visibleToClient: v.boolean() },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const document = await ctx.db.get("documents", args.documentId);
    if (!document) return fail("NOT_FOUND", "Documento non trovato.");
    await ctx.db.patch("documents", args.documentId, { visibleToClient: args.visibleToClient });
    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: document.clientId,
      action: "document.visibility_changed",
      resourceType: "document",
      resourceId: args.documentId,
      metadata: { visibleToClient: args.visibleToClient },
    });
    return null;
  },
});
