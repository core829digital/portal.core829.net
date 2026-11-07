import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { fail, INVALID_LINK_MESSAGE } from "./lib/errors";
import { requireUnlock, resolveLink } from "./lib/links";
import { buildOverview, loadWidgets } from "./lib/overview";

/**
 * Funzioni pubbliche del portale cliente (sola lettura, senza login).
 *
 * REGOLE:
 *  - l'unica chiave d'accesso e' il token del link: il cliente NON puo' scegliere di quale cliente
 *    vedere i dati, il `clientId` si ricava sempre dal link sul server;
 *  - ogni risposta e' costruita campo per campo (DTO): niente documenti interi, niente `internalNotes`,
 *    niente `storageId`, niente ID di altri clienti;
 *  - elenchi sempre limitati (take), mai `collect()`.
 */

export const overview = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const link = await resolveLink(ctx, args.token);
    const data = await buildOverview(ctx, link.clientId);
    if (!data) return fail("INVALID_LINK", INVALID_LINK_MESSAGE);
    // Al cliente arrivano solo i blocchi attivi, nell'ordine scelto.
    const { widgets } = await loadWidgets(ctx, link.clientId);
    return { ...data, widgets: widgets.filter((w) => w.enabled) };
  },
});

/** Elenco dei documenti: richiede il codice di sblocco. Mostra solo file puliti e visibili al cliente. */
export const documents = query({
  args: { token: v.string(), unlockToken: v.string() },
  handler: async (ctx, args) => {
    const link = await resolveLink(ctx, args.token);
    await requireUnlock(ctx, link, args.unlockToken);

    const docs = await ctx.db
      .query("documents")
      .withIndex("by_clientId", (q) => q.eq("clientId", link.clientId))
      .order("desc")
      .take(200);
    return docs
      .filter((d) => d.visibleToClient && d.scanStatus === "clean")
      .map((d) => ({
        id: d._id,
        title: d.title,
        kind: d.kind,
        fileName: d.fileName,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        createdAt: d._creationTime,
      }));
  },
});

/** Registra l'apertura del link. Al massimo una scrittura al minuto, per non amplificare le richieste. */
export const touch = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const link = await resolveLink(ctx, args.token);
    const now = Date.now();
    if (link.lastUsedAt !== undefined && now - link.lastUsedAt < 60_000) return null;
    await ctx.db.patch("accessLinks", link._id, { lastUsedAt: now, useCount: link.useCount + 1 });
    await audit(ctx, {
      actorType: "client",
      clientId: link.clientId,
      action: "portal.opened",
      resourceType: "accessLink",
      resourceId: link._id,
    });
    return null;
  },
});
