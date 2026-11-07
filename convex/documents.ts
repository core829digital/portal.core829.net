import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";
import { MAX_FILE_BYTES, extensionOf, mimeFor, typeForExtension } from "./lib/files";
import { cleanFileName, cleanText } from "./lib/text";
import { documentKind } from "./lib/validators";

/**
 * Documenti dei clienti.
 *
 * Percorso di un file: caricamento -> `finalize` (controlli rapidi) -> `documentScan.scan` (controllo del
 * contenuto) -> `clean` oppure `rejected`. Solo i file `clean` si possono scaricare. Mai restituire `storageId`
 * al cliente.
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

/** Indirizzo temporaneo a cui il browser dell'amministratore invia il file. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export type FinalizeResult = { ok: true; documentId: string } | { ok: false; message: string };

/**
 * Registra un file appena caricato e avvia il controllo. I rifiuti RESTITUISCONO un risultato invece di
 * lanciare un errore: un errore annullerebbe anche la cancellazione del file appena rifiutato.
 */
export const finalize = mutation({
  args: {
    clientId: v.id("clients"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    title: v.string(),
    kind: documentKind,
    projectId: v.optional(v.id("projects")),
    visibleToClient: v.boolean(),
  },
  handler: async (ctx, args): Promise<FinalizeResult> => {
    const { actorId } = await requireAdmin(ctx);
    const client = await ctx.db.get("clients", args.clientId);
    if (!client) return fail("NOT_FOUND", "Cliente non trovato.");
    if (args.projectId !== undefined) {
      const project = await ctx.db.get("projects", args.projectId);
      if (!project || project.clientId !== args.clientId) return fail("NOT_FOUND", "Progetto non trovato.");
    }
    const stored = await ctx.db.system.get("_storage", args.storageId);
    if (!stored) return fail("NOT_FOUND", "File non trovato: riprova il caricamento.");
    const already = await ctx.db
      .query("documents")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();
    if (already) return fail("CONFLICT", "Questo file è già stato registrato.");

    const fileName = cleanFileName(args.fileName);
    const title = cleanText(args.title, { field: "titolo", min: 1, max: 120 });
    const type = typeForExtension(extensionOf(fileName));

    // Controlli rapidi: se falliscono si cancella subito il file, senza nemmeno leggerlo.
    let rejection: string | null = null;
    if (type === null) rejection = "Tipo di file non ammesso. Sono ammessi PDF, PNG, JPEG, DOCX e XLSX.";
    else if (stored.size > MAX_FILE_BYTES) rejection = `Il file supera i ${MAX_FILE_BYTES / (1024 * 1024)} MB consentiti.`;
    else if (stored.size === 0) rejection = "Il file è vuoto.";
    if (rejection !== null || type === null) {
      await ctx.storage.delete(args.storageId);
      return { ok: false, message: rejection ?? "Tipo di file non ammesso." };
    }

    const documentId = await ctx.db.insert("documents", {
      clientId: args.clientId,
      projectId: args.projectId,
      kind: args.kind,
      title,
      storageId: args.storageId,
      fileName,
      mimeType: mimeFor(type),
      sizeBytes: stored.size,
      scanStatus: "pending",
      visibleToClient: args.visibleToClient,
    });
    await ctx.scheduler.runAfter(0, internal.documentScan.scan, { documentId });
    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: args.clientId,
      action: "document.uploaded",
      resourceType: "document",
      resourceId: documentId,
      metadata: { fileName, sizeBytes: stored.size },
    });
    return { ok: true, documentId };
  },
});

/** Elimina il documento e il file. */
export const remove = mutation({
  args: {
    documentId: v.id("documents"),
    /** Serve per eliminare un documento che era stato inviato al cliente (es. un contratto): va chiesto di proposito. */
    confirmSent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const document = await ctx.db.get("documents", args.documentId);
    if (!document) return null;
    // Un documento inviato al cliente (contratto, preventivo) e' una prova: si elimina solo con conferma esplicita.
    const sentDrafts = (
      await ctx.db
        .query("docDrafts")
        .withIndex("by_clientId", (q) => q.eq("clientId", document.clientId))
        .take(500)
    ).filter((d) => d.documentIds?.includes(args.documentId));
    if (sentDrafts.length > 0 && args.confirmSent !== true) {
      return fail("BAD_STATE", "Questo documento è stato inviato al cliente. Conferma l'eliminazione per cancellarlo.");
    }
    for (const d of sentDrafts) {
      await ctx.db.patch("docDrafts", d._id, { documentIds: (d.documentIds ?? []).filter((id) => id !== args.documentId) });
    }
    // Le fatture che puntavano a questo PDF restano, senza il collegamento.
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_clientId", (q) => q.eq("clientId", document.clientId))
      .take(200);
    for (const invoice of invoices) {
      if (invoice.documentId === args.documentId) await ctx.db.patch("invoices", invoice._id, { documentId: undefined });
    }
    await ctx.storage.delete(document.storageId);
    await ctx.db.delete("documents", args.documentId);
    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: document.clientId,
      action: "document.deleted",
      resourceType: "document",
      resourceId: args.documentId,
      metadata: { fileName: document.fileName, wasSent: String(sentDrafts.length > 0) },
    });
    return null;
  },
});

/** Indirizzo di scaricamento per l'amministratore. Solo per file gia' controllati. */
export const adminUrl = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const document = await ctx.db.get("documents", args.documentId);
    if (!document || document.scanStatus !== "clean") return null;
    return await ctx.storage.getUrl(document.storageId);
  },
});

/* ---- Funzioni interne, usate solo dalla scansione ---- */

export const getForScan = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const document = await ctx.db.get("documents", args.documentId);
    if (!document) return null;
    return { storageId: document.storageId, fileName: document.fileName, scanStatus: document.scanStatus };
  },
});

/** Registra l'esito del controllo. Idempotente: agisce solo su documenti ancora `pending`. */
export const setScanResult = internalMutation({
  args: {
    documentId: v.id("documents"),
    ok: v.boolean(),
    reason: v.optional(v.string()),
    sha256: v.optional(v.string()),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get("documents", args.documentId);
    if (!document || document.scanStatus !== "pending") return null;
    if (args.ok) {
      await ctx.db.patch("documents", args.documentId, {
        scanStatus: "clean",
        sha256: args.sha256,
        mimeType: args.mimeType ?? document.mimeType,
      });
    } else {
      // Un file respinto non resta sul server.
      await ctx.storage.delete(document.storageId);
      await ctx.db.patch("documents", args.documentId, {
        scanStatus: "rejected",
        rejectReason: (args.reason ?? "File non valido.").slice(0, 300),
        sha256: args.sha256,
        visibleToClient: false,
      });
    }
    await audit(ctx, {
      actorType: "system",
      clientId: document.clientId,
      action: args.ok ? "document.scan_clean" : "document.scan_rejected",
      resourceType: "document",
      resourceId: args.documentId,
      metadata: args.ok ? {} : { reason: (args.reason ?? "").slice(0, 120) },
    });
    return null;
  },
});
