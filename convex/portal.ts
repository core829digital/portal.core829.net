import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { fail, INVALID_LINK_MESSAGE } from "./lib/errors";
import { requireUnlock, resolveLink } from "./lib/links";
import { buildOverview, loadWidgets } from "./lib/overview";
import { buildReportView } from "./lib/reportData";
import { isMonthStart } from "./lib/reports";

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

/** Mesi con un report pubblicato (richiede il codice di sblocco: contiene dati del business del cliente). */
export const reports = query({
  args: { token: v.string(), unlockToken: v.string() },
  handler: async (ctx, args) => {
    const link = await resolveLink(ctx, args.token);
    await requireUnlock(ctx, link, args.unlockToken);
    const rows = await ctx.db
      .query("clientReports")
      .withIndex("by_clientId_and_month", (q) => q.eq("clientId", link.clientId))
      .order("desc")
      .take(60);
    return rows.filter((r) => r.status === "published").map((r) => ({ month: r.month, metricCount: r.metrics.length, publishedAt: r.publishedAt ?? null }));
  },
});

/** Un report pubblicato, con il confronto sul mese prima. Le bozze non esistono per il cliente. */
export const report = query({
  args: { token: v.string(), unlockToken: v.string(), month: v.number() },
  handler: async (ctx, args) => {
    const link = await resolveLink(ctx, args.token);
    await requireUnlock(ctx, link, args.unlockToken);
    if (!isMonthStart(args.month)) return null;
    return await buildReportView(ctx, link.clientId, args.month, { onlyPublished: true });
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

/**
 * Verifica che QUESTO cliente possa scaricare QUESTO documento (link valido + sessione di sblocco + documento
 * suo, visibile e pulito) e registra lo scaricamento. Interna: la chiama solo l'endpoint /portal/download.
 * Ogni motivo di rifiuto e' un errore: chi chiama risponde sempre allo stesso modo.
 */
export const prepareDownload = internalMutation({
  args: { token: v.string(), unlockToken: v.string(), documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const link = await resolveLink(ctx, args.token);
    await requireUnlock(ctx, link, args.unlockToken);
    const document = await ctx.db.get("documents", args.documentId);
    if (!document || document.clientId !== link.clientId || !document.visibleToClient || document.scanStatus !== "clean") {
      return fail("NOT_FOUND", "Documento non trovato.");
    }
    await audit(ctx, {
      actorType: "client",
      clientId: link.clientId,
      action: "document.downloaded",
      resourceType: "document",
      resourceId: args.documentId,
    });
    return { storageId: document.storageId, fileName: document.fileName, mimeType: document.mimeType };
  },
});
