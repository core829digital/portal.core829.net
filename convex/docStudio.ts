import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";
import { cleanText } from "./lib/text";
import { docCategory, pdfAnnotation } from "./lib/validators";

/**
 * Studio documenti (solo amministratore): modelli DOCX, bozze per cliente, invio via email.
 * Qui le parti leggere (database); la lettura/scrittura dei file e' in docStudioActions.ts (runtime Node).
 */

const KIND_FOR_CATEGORY = { contract: "contract", quote: "quote", legal: "other", other: "other" } as const;

/** Controllo di accesso per le azioni (che non leggono il database direttamente). */
export const assertAdmin = internalQuery({
  args: {},
  handler: async (ctx): Promise<{ actorId: string }> => {
    const { actorId } = await requireAdmin(ctx);
    return { actorId };
  },
});

export const uploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const listTemplates = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("docTemplates")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .order("desc")
      .take(200);
    return rows.map((t) => ({
      id: t._id,
      name: t.name,
      category: t.category,
      sizeBytes: t.sizeBytes,
      paragraphCount: t.paragraphCount,
      fieldCount: t.fieldCount,
      createdAt: t._creationTime,
      builtinKey: t.builtinKey ?? null,
      description: t.description ?? null,
    }));
  },
});

export const archiveTemplate = mutation({
  args: { templateId: v.id("docTemplates") },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const t = await ctx.db.get("docTemplates", args.templateId);
    if (!t) return fail("NOT_FOUND", "Modello non trovato.");
    await ctx.db.patch("docTemplates", t._id, { archived: true });
    await audit(ctx, { actorType: "admin", actorId, action: "doc.template_archived", resourceType: "docTemplate", resourceId: t._id });
    return null;
  },
});

export const listDrafts = query({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const clientId = args.clientId;
    const rows =
      clientId === undefined
        ? await ctx.db.query("docDrafts").order("desc").take(200)
        : await ctx.db
            .query("docDrafts")
            .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
            .order("desc")
            .take(100);
    const names = new Map<Id<"clients">, string>();
    for (const d of rows) {
      if (!names.has(d.clientId)) names.set(d.clientId, (await ctx.db.get("clients", d.clientId))?.displayName ?? "Cliente");
    }
    return rows.map((d) => ({
      id: d._id,
      clientId: d.clientId,
      clientName: names.get(d.clientId) ?? "Cliente",
      name: d.name,
      category: d.category,
      format: d.format ?? "docx",
      status: d.status,
      sentAt: d.sentAt ?? null,
      sentTo: d.sentTo ?? null,
      updatedAt: d._creationTime,
    }));
  },
});

export const getDraft = query({
  args: { draftId: v.id("docDrafts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const d = await ctx.db.get("docDrafts", args.draftId);
    if (!d) return null;
    const client = await ctx.db.get("clients", d.clientId);
    return {
      id: d._id,
      name: d.name,
      category: d.category,
      format: d.format ?? "docx",
      status: d.status,
      sentAt: d.sentAt ?? null,
      sentTo: d.sentTo ?? null,
      client: client
        ? {
            id: client._id,
            displayName: client.displayName,
            email: client.email,
            contactName: client.contactName,
            phone: client.phone ?? null,
            vatId: client.vatId ?? null,
            address: client.address ?? null,
            pec: client.pec ?? null,
            legalRep: client.legalRep ?? null,
            website: client.website ?? null,
          }
        : null,
    };
  },
});

export const deleteDraft = mutation({
  args: { draftId: v.id("docDrafts") },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const d = await ctx.db.get("docDrafts", args.draftId);
    if (!d) return fail("NOT_FOUND", "Bozza non trovata.");
    if (d.status === "sent") return fail("BAD_STATE", "Un documento già inviato non si elimina: resta nel fascicolo del cliente.");
    await ctx.storage.delete(d.storageId);
    if (d.previewStorageId) await ctx.storage.delete(d.previewStorageId);
    if (d.originalStorageId) await ctx.storage.delete(d.originalStorageId);
    await ctx.db.delete("docDrafts", d._id);
    await audit(ctx, { actorType: "admin", actorId, clientId: d.clientId, action: "doc.draft_deleted", resourceType: "docDraft", resourceId: d._id });
    return null;
  },
});

// ---- Funzioni interne usate dalle azioni (docStudioActions.ts) ----

/** Chiavi dei modelli CORE829 gia' installati (non archiviati). */
export const installedBuiltinKeys = internalQuery({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const rows = await ctx.db
      .query("docTemplates")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .take(500);
    return rows.flatMap((t) => (t.builtinKey ? [t.builtinKey] : []));
  },
});

export const insertTemplate = internalMutation({
  args: {
    name: v.string(),
    category: docCategory,
    storageId: v.id("_storage"),
    sizeBytes: v.number(),
    paragraphCount: v.number(),
    fieldCount: v.number(),
    createdBy: v.string(),
    builtinKey: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"docTemplates">> => {
    const id = await ctx.db.insert("docTemplates", {
      builtinKey: args.builtinKey,
      description: args.description === undefined ? undefined : cleanText(args.description, { field: "descrizione", max: 400 }),
      name: cleanText(args.name, { field: "nome", min: 1, max: 120 }),
      category: args.category,
      storageId: args.storageId,
      sizeBytes: args.sizeBytes,
      paragraphCount: args.paragraphCount,
      fieldCount: args.fieldCount,
      archived: false,
      createdBy: args.createdBy,
    });
    await audit(ctx, { actorType: "admin", actorId: args.createdBy, action: "doc.template_imported", resourceType: "docTemplate", resourceId: id });
    return id;
  },
});

export const templateAndClient = internalQuery({
  args: { templateId: v.optional(v.id("docTemplates")), clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const template = args.templateId ? await ctx.db.get("docTemplates", args.templateId) : null;
    const client = await ctx.db.get("clients", args.clientId);
    return {
      template: template && !template.archived ? { id: template._id, name: template.name, category: template.category, storageId: template.storageId } : null,
      client: client
        ? {
            id: client._id,
            displayName: client.displayName,
            contactName: client.contactName,
            email: client.email,
            phone: client.phone ?? null,
            vatId: client.vatId ?? null,
            address: client.address ?? null,
            pec: client.pec ?? null,
            legalRep: client.legalRep ?? null,
            website: client.website ?? null,
          }
        : null,
    };
  },
});

/** Quante bozze della categoria esistono gia' nell'anno: serve al numero progressivo del documento (CTR-2026-001...). */
export const countDraftsInYear = internalQuery({
  args: { category: docCategory, year: v.number() },
  handler: async (ctx, args): Promise<number> => {
    const from = Date.UTC(args.year, 0, 1) - 24 * 3600 * 1000;
    const to = Date.UTC(args.year + 1, 0, 1) + 24 * 3600 * 1000;
    const rows = await ctx.db
      .query("docDrafts")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", from).lt("_creationTime", to))
      .take(5000);
    return rows.filter((d) => d.category === args.category).length;
  },
});

export const insertDraft = internalMutation({
  args: {
    clientId: v.id("clients"),
    templateId: v.optional(v.id("docTemplates")),
    name: v.string(),
    category: docCategory,
    storageId: v.id("_storage"),
    format: v.optional(v.union(v.literal("docx"), v.literal("pdf"))),
    originalStorageId: v.optional(v.id("_storage")),
    annotations: v.optional(v.array(pdfAnnotation)),
    actorId: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"docDrafts">> => {
    const id = await ctx.db.insert("docDrafts", {
      clientId: args.clientId,
      templateId: args.templateId,
      name: cleanText(args.name, { field: "nome", min: 1, max: 120 }),
      category: args.category,
      format: args.format,
      storageId: args.storageId,
      originalStorageId: args.originalStorageId,
      annotations: args.format === "pdf" ? (args.annotations ?? []) : undefined,
      status: "draft",
    });
    await audit(ctx, { actorType: "admin", actorId: args.actorId, clientId: args.clientId, action: "doc.draft_created", resourceType: "docDraft", resourceId: id });
    return id;
  },
});

export const draftForAction = internalQuery({
  args: { draftId: v.id("docDrafts") },
  handler: async (ctx, args) => {
    const d = await ctx.db.get("docDrafts", args.draftId);
    if (!d) return null;
    const client = await ctx.db.get("clients", d.clientId);
    return {
      id: d._id,
      clientId: d.clientId,
      name: d.name,
      category: d.category,
      format: d.format ?? "docx",
      storageId: d.storageId,
      originalStorageId: d.originalStorageId ?? null,
      annotations: d.annotations ?? [],
      previewStorageId: d.previewStorageId ?? null,
      status: d.status,
      clientEmail: client?.email ?? null,
      clientName: client?.displayName ?? null,
    };
  },
});

export const patchDraftFile = internalMutation({
  args: {
    draftId: v.id("docDrafts"),
    storageId: v.optional(v.id("_storage")),
    previewStorageId: v.optional(v.id("_storage")),
    annotations: v.optional(v.array(pdfAnnotation)),
    actorId: v.string(),
  },
  handler: async (ctx, args): Promise<null> => {
    const d = await ctx.db.get("docDrafts", args.draftId);
    if (!d) return null;
    const patch: Partial<Doc<"docDrafts">> = {};
    if (args.storageId) {
      await ctx.storage.delete(d.storageId);
      patch.storageId = args.storageId;
    }
    if (args.previewStorageId) {
      if (d.previewStorageId) await ctx.storage.delete(d.previewStorageId);
      patch.previewStorageId = args.previewStorageId;
    }
    if (args.annotations) patch.annotations = args.annotations;
    await ctx.db.patch("docDrafts", d._id, patch);
    if (args.storageId) {
      await audit(ctx, { actorType: "admin", actorId: args.actorId, clientId: d.clientId, action: "doc.draft_saved", resourceType: "docDraft", resourceId: d._id });
    }
    return null;
  },
});

/** Dopo l'invio riuscito: i file inviati entrano nel fascicolo del cliente e la bozza risulta "inviata". */
export const recordSent = internalMutation({
  args: {
    draftId: v.id("docDrafts"),
    to: v.string(),
    actorId: v.string(),
    files: v.array(v.object({ storageId: v.id("_storage"), fileName: v.string(), mimeType: v.string(), sizeBytes: v.number() })),
  },
  handler: async (ctx, args): Promise<Id<"documents">[]> => {
    const d = await ctx.db.get("docDrafts", args.draftId);
    if (!d) return fail("NOT_FOUND", "Bozza non trovata.");
    const documentIds: Id<"documents">[] = [];
    for (const f of args.files) {
      documentIds.push(
        await ctx.db.insert("documents", {
          clientId: d.clientId,
          kind: KIND_FOR_CATEGORY[d.category],
          title: d.name,
          storageId: f.storageId,
          fileName: f.fileName,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          // File generato dal sistema stesso (non caricato da terzi): nessuna scansione necessaria.
          scanStatus: "clean",
          visibleToClient: true,
        }),
      );
    }
    await ctx.db.patch("docDrafts", d._id, { status: "sent", sentAt: Date.now(), sentTo: args.to, documentIds });
    await audit(ctx, {
      actorType: "admin",
      actorId: args.actorId,
      clientId: d.clientId,
      action: "doc.sent",
      resourceType: "docDraft",
      resourceId: d._id,
      metadata: { files: args.files.length },
    });
    return documentIds;
  },
});
