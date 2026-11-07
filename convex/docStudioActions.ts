"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, env, type ActionCtx } from "./_generated/server";
import { renderPdf } from "./lib/docPdf";
import { autofillFields, buildVariables, documentNumber, formatDateRome, type ClientData, type DocCategory } from "./lib/autofill";
import { autofillPdf } from "./lib/pdfAutofill";
import {
  applyChanges,
  detectFields,
  DocxError,
  listParagraphs,
  MAX_DOCX_BYTES,
  readDocx,
  toModel,
  writeDocx,
  type DocField,
  type DocParagraph,
} from "./lib/docx";
import { cleanAnnotations, inspectPdf, MAX_PDF_BYTES, PdfError, stampPdf, type PdfInfo } from "./lib/pdfStamp";
import { sendEmail } from "./lib/resend";
import { cleanEmail, cleanText, escapeHtml, invalid } from "./lib/text";
import { docCategory, pdfAnnotation } from "./lib/validators";

/**
 * Azioni del runtime Node per i documenti (leggere/scrivere DOCX, generare PDF, spedire email con allegati).
 * Tutte riservate all'amministratore: il primo passo e' sempre `assertAdmin`.
 */

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";
const MAX_ATTACH_TOTAL = 30 * 1024 * 1024;

async function admin(ctx: { runQuery: (ref: typeof internal.docStudio.assertAdmin, args: Record<string, never>) => Promise<{ actorId: string }> }) {
  return await ctx.runQuery(internal.docStudio.assertAdmin, {});
}

async function loadBytes(ctx: { storage: { get: (id: Id<"_storage">) => Promise<Blob | null> } }, id: Id<"_storage">): Promise<Uint8Array> {
  const blob = await ctx.storage.get(id);
  if (!blob) return invalid("file", "File non trovato.");
  if (blob.size > MAX_DOCX_BYTES) return invalid("file", "Il file supera i 15 MB.");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Apre un DOCX trasformando gli errori del motore in errori applicativi leggibili. */
function open(bytes: Uint8Array) {
  try {
    return readDocx(bytes);
  } catch (error) {
    if (error instanceof DocxError) return invalid("file", error.message);
    throw error;
  }
}

async function loadPdfBytes(ctx: { storage: { get: (id: Id<"_storage">) => Promise<Blob | null> } }, id: Id<"_storage">): Promise<Uint8Array> {
  const blob = await ctx.storage.get(id);
  if (!blob) return invalid("file", "File non trovato.");
  if (blob.size > MAX_PDF_BYTES) return invalid("file", "Il file supera i 15 MB.");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Controlla un PDF trasformando gli errori del motore in errori applicativi leggibili. */
async function checkPdf(bytes: Uint8Array): Promise<PdfInfo> {
  try {
    return await inspectPdf(bytes);
  } catch (error) {
    if (error instanceof PdfError) return invalid("file", error.message);
    throw error;
  }
}

type ClientForDocs = ClientData;

/** Numero del prossimo documento della categoria e variabili compilate (CORE829 SRL + cliente). */
async function autofillContext(ctx: ActionCtx, client: ClientForDocs, category: DocCategory) {
  const now = Date.now();
  const year = Number(formatDateRome(now).slice(-4));
  const count = await ctx.runQuery(internal.docStudio.countDraftsInYear, { category, year });
  return buildVariables(client, { now, number: documentNumber(category, year, count) });
}

const safeName = (name: string): string => {
  const base = name
    .replace(/[\u2013\u2014]/g, "-")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9._ -]+/g, "_")
    .trim()
    .slice(0, 80);
  return base === "" ? "documento" : base;
};

async function storeBlob(ctx: { storage: { store: (b: Blob) => Promise<Id<"_storage">> } }, bytes: Uint8Array, type: string): Promise<Id<"_storage">> {
  return await ctx.storage.store(new Blob([bytes as BlobPart], { type }));
}

/** Registra un file DOCX caricato come modello (contratto, preventivo, documento legale...). */
export const importTemplate = action({
  args: { storageId: v.id("_storage"), name: v.string(), category: docCategory },
  handler: async (ctx, args): Promise<{ templateId: Id<"docTemplates">; paragraphs: number; fields: number }> => {
    const { actorId } = await admin(ctx);
    try {
      const name = cleanText(args.name, { field: "nome", min: 1, max: 120 });
      const bytes = await loadBytes(ctx, args.storageId);
      const files = open(bytes);
      const paragraphs = listParagraphs(files);
      const fields = detectFields(paragraphs);
      const templateId = await ctx.runMutation(internal.docStudio.insertTemplate, {
        name,
        category: args.category,
        storageId: args.storageId,
        sizeBytes: bytes.length,
        paragraphCount: paragraphs.length,
        fieldCount: fields.length,
        createdBy: actorId,
      });
      return { templateId, paragraphs: paragraphs.length, fields: fields.length };
    } catch (error) {
      await ctx.storage.delete(args.storageId); // un file non valido non resta in archivio
      throw error;
    }
  },
});

/** Crea la bozza di un cliente da un modello (con i dati del cliente gia' inseriti) o da un DOCX caricato. */
export const createDraft = action({
  args: {
    clientId: v.id("clients"),
    templateId: v.optional(v.id("docTemplates")),
    uploadStorageId: v.optional(v.id("_storage")),
    name: v.optional(v.string()),
    category: v.optional(docCategory),
  },
  handler: async (ctx, args): Promise<{ draftId: Id<"docDrafts">; autofilled: number; number: string }> => {
    const { actorId } = await admin(ctx);
    try {
      if ((args.templateId === undefined) === (args.uploadStorageId === undefined)) return invalid("origine", "Scegli un modello oppure carica un file.");
      const { template, client } = await ctx.runQuery(internal.docStudio.templateAndClient, { templateId: args.templateId, clientId: args.clientId });
      if (!client) return invalid("cliente", "Cliente non trovato.");
      if (args.templateId !== undefined && !template) return invalid("modello", "Modello non trovato.");

      const sourceId = template ? template.storageId : (args.uploadStorageId as Id<"_storage">);
      const files = open(await loadBytes(ctx, sourceId));
      const category = template ? template.category : (args.category ?? "other");
      const vars = await autofillContext(ctx, client, category);
      const { fills, filled } = autofillFields(detectFields(listParagraphs(files)), vars);
      const merged = writeDocx(applyChanges(files, { vars, fills }));
      const storageId = await storeBlob(ctx, merged, DOCX_MIME);
      const draftId = await ctx.runMutation(internal.docStudio.insertDraft, {
        clientId: args.clientId,
        templateId: args.templateId,
        name: cleanText(args.name ?? (template ? `${template.name} — ${client.displayName}` : "Documento"), { field: "nome", min: 1, max: 120 }),
        category,
        storageId,
        actorId,
      });
      if (args.uploadStorageId) await ctx.storage.delete(args.uploadStorageId); // la copia di lavoro e' quella nuova
      return { draftId, autofilled: filled.length, number: vars["contract.number"] };
    } catch (error) {
      if (args.uploadStorageId) await ctx.storage.delete(args.uploadStorageId).catch(() => undefined);
      throw error;
    }
  },
});

/** Testo e campi del documento, per l'editor. */
export const inspectDraft = action({
  args: { draftId: v.id("docDrafts") },
  handler: async (ctx, args): Promise<{ paragraphs: DocParagraph[]; fields: DocField[] }> => {
    await admin(ctx);
    const draft = await ctx.runQuery(internal.docStudio.draftForAction, { draftId: args.draftId });
    if (!draft) return invalid("bozza", "Bozza non trovata.");
    if (draft.format === "pdf") return invalid("bozza", "Questo documento è un PDF: usa l'editor PDF.");
    const paragraphs = listParagraphs(open(await loadBytes(ctx, draft.storageId)));
    return { paragraphs, fields: detectFields(paragraphs) };
  },
});

const MAX_OPS = 3000;

/** Salva le modifiche fatte nell'editor (testo, campi, paragrafi aggiunti/eliminati). */
export const saveDraft = action({
  args: {
    draftId: v.id("docDrafts"),
    edits: v.array(v.object({ index: v.number(), text: v.string() })),
    deletes: v.array(v.number()),
    inserts: v.array(v.object({ after: v.number(), texts: v.array(v.string()) })),
    fills: v.array(v.object({ id: v.string(), value: v.string() })),
  },
  handler: async (ctx, args): Promise<{ paragraphs: number }> => {
    const { actorId } = await admin(ctx);
    if (args.edits.length + args.deletes.length + args.inserts.length + args.fills.length > MAX_OPS) return invalid("modifiche", "Troppe modifiche in un solo salvataggio.");
    const draft = await ctx.runQuery(internal.docStudio.draftForAction, { draftId: args.draftId });
    if (!draft) return invalid("bozza", "Bozza non trovata.");
    if (draft.status === "sent") return invalid("bozza", "Il documento è già stato inviato: crea una nuova bozza per modificarlo.");
    if (draft.format === "pdf") return invalid("bozza", "Questo documento è un PDF: usa l'editor PDF.");
    const original = open(await loadBytes(ctx, draft.storageId));
    const updated = applyChanges(original, {
      edits: Object.fromEntries(args.edits.map((e) => [e.index, e.text])),
      deletes: args.deletes,
      inserts: Object.fromEntries(args.inserts.map((i) => [i.after, i.texts])),
      fills: Object.fromEntries(args.fills.map((f) => [f.id, f.value])),
    });
    const bytes = writeDocx(updated);
    const storageId = await storeBlob(ctx, bytes, DOCX_MIME);
    await ctx.runMutation(internal.docStudio.patchDraftFile, { draftId: args.draftId, storageId, actorId });
    return { paragraphs: listParagraphs(updated).length };
  },
});

/** Genera l'anteprima PDF e restituisce il suo indirizzo (valido per l'amministratore, si sovrascrive alla successiva). */
export const previewDraft = action({
  args: { draftId: v.id("docDrafts"), format: v.union(v.literal("pdf"), v.literal("docx")) },
  handler: async (ctx, args): Promise<{ url: string; fileName: string }> => {
    const { actorId } = await admin(ctx);
    const draft = await ctx.runQuery(internal.docStudio.draftForAction, { draftId: args.draftId });
    if (!draft) return invalid("bozza", "Bozza non trovata.");
    if (draft.format === "pdf") {
      if (args.format !== "pdf") return invalid("formato", "Un PDF caricato si scarica solo in PDF.");
      const url = await ctx.storage.getUrl(draft.storageId);
      if (!url) return invalid("file", "File non disponibile.");
      return { url, fileName: `${safeName(draft.name)}.pdf` };
    }
    if (args.format === "docx") {
      const url = await ctx.storage.getUrl(draft.storageId);
      if (!url) return invalid("file", "File non disponibile.");
      return { url, fileName: `${safeName(draft.name)}.docx` };
    }
    const pdf = await renderPdf(toModel(open(await loadBytes(ctx, draft.storageId))), { title: draft.name });
    const previewStorageId = await storeBlob(ctx, pdf, PDF_MIME);
    await ctx.runMutation(internal.docStudio.patchDraftFile, { draftId: args.draftId, previewStorageId, actorId });
    const url = await ctx.storage.getUrl(previewStorageId);
    if (!url) return invalid("file", "File non disponibile.");
    return { url, fileName: `${safeName(draft.name)}.pdf` };
  },
});

/** Spedisce il documento al cliente via Resend (PDF e/o DOCX in allegato) e lo archivia nel suo fascicolo. */
export const sendDraft = action({
  args: {
    draftId: v.id("docDrafts"),
    to: v.string(),
    subject: v.string(),
    message: v.string(),
    formats: v.array(v.union(v.literal("pdf"), v.literal("docx"))),
  },
  handler: async (ctx, args): Promise<{ sentTo: string; attachments: number }> => {
    const { actorId } = await admin(ctx);
    if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) return invalid("email", "Configurazione email mancante (RESEND_API_KEY, AUTH_EMAIL_FROM).");
    const to = cleanEmail(args.to, "destinatario");
    const subject = cleanText(args.subject, { field: "oggetto", min: 1, max: 150 });
    const message = cleanText(args.message, { field: "messaggio", max: 4000, multiline: true });
    const formats = [...new Set(args.formats)];
    if (formats.length === 0) return invalid("formato", "Scegli almeno un formato da allegare.");

    const draft = await ctx.runQuery(internal.docStudio.draftForAction, { draftId: args.draftId });
    if (!draft) return invalid("bozza", "Bozza non trovata.");
    if (draft.status === "sent") return invalid("bozza", "Questo documento è già stato inviato.");
    const base = safeName(draft.name);

    const generated: { fileName: string; mimeType: string; bytes: Uint8Array }[] = [];
    if (draft.format === "pdf") {
      // PDF caricato: si invia il file con i testi gia' applicati (non esiste una versione Word).
      generated.push({ fileName: `${base}.pdf`, mimeType: PDF_MIME, bytes: await loadPdfBytes(ctx, draft.storageId) });
    } else {
      const docx = await loadBytes(ctx, draft.storageId);
      if (formats.includes("pdf")) generated.push({ fileName: `${base}.pdf`, mimeType: PDF_MIME, bytes: await renderPdf(toModel(open(docx)), { title: draft.name }) });
      if (formats.includes("docx")) generated.push({ fileName: `${base}.docx`, mimeType: DOCX_MIME, bytes: docx });
    }
    if (generated.reduce((n, g) => n + g.bytes.length, 0) > MAX_ATTACH_TOTAL) return invalid("allegati", "Gli allegati superano i 30 MB.");

    const html =
      `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">` +
      `<p style="font-size:13px;letter-spacing:2px;color:#c2410c;font-weight:bold;margin:0">CORE829</p>` +
      `<p style="font-size:16px;line-height:24px;white-space:pre-wrap">${escapeHtml(message)}</p>` +
      `<p style="font-size:13px;line-height:20px;color:#6b7280">In allegato: ${generated.map((g) => escapeHtml(g.fileName)).join(", ")}.<br/>CORE829 SRL · Str. Mihai Eminescu 10, Roman, Romania · CUI/CIF 54616345</p>` +
      `</div>`;

    await sendEmail(env.RESEND_API_KEY, {
      from: env.AUTH_EMAIL_FROM,
      to,
      subject,
      text: `${message}\n\nIn allegato: ${generated.map((g) => g.fileName).join(", ")}.\nCORE829 SRL`,
      html,
      replyTo: "office@core829.net",
      attachments: generated.map((g) => ({ filename: g.fileName, content: Buffer.from(g.bytes).toString("base64") })),
    });

    // L'email e' partita: si archiviano i file nel fascicolo del cliente (visibili nel suo portale, dietro il codice).
    const files = [];
    for (const g of generated) {
      files.push({ storageId: await storeBlob(ctx, g.bytes, g.mimeType), fileName: g.fileName, mimeType: g.mimeType, sizeBytes: g.bytes.length });
    }
    await ctx.runMutation(internal.docStudio.recordSent, { draftId: args.draftId, to, actorId, files });
    return { sentTo: to, attachments: generated.length };
  },
});

/** Crea la bozza di un cliente da un PDF gia' pronto caricato (da completare con testi sovrapposti). */
export const createPdfDraft = action({
  args: { clientId: v.id("clients"), uploadStorageId: v.id("_storage"), name: v.string(), category: docCategory },
  handler: async (ctx, args): Promise<{ draftId: Id<"docDrafts">; autofilled: number }> => {
    const { actorId } = await admin(ctx);
    try {
      const { client } = await ctx.runQuery(internal.docStudio.templateAndClient, { clientId: args.clientId });
      if (!client) return invalid("cliente", "Cliente non trovato.");
      const name = cleanText(args.name, { field: "nome", min: 1, max: 120 });
      const bytes = await loadPdfBytes(ctx, args.uploadStorageId);
      await checkPdf(bytes);
      // Campi modulo riconoscibili: compilati in automatico come testi sovrapposti (modificabili nell'editor).
      const { annotations, filled } = await autofillPdf(bytes, await autofillContext(ctx, client, args.category));
      const kept = cleanAnnotations(annotations, (await inspectPdf(bytes)).pages.length);
      // Il file caricato resta intatto (originale); la copia di lavoro e' un oggetto a parte.
      const working = await storeBlob(ctx, kept.length > 0 ? await stampPdf(bytes, kept) : bytes, PDF_MIME);
      const draftId = await ctx.runMutation(internal.docStudio.insertDraft, {
        clientId: args.clientId,
        name,
        category: args.category,
        storageId: working,
        format: "pdf",
        originalStorageId: args.uploadStorageId,
        annotations: kept,
        actorId,
      });
      return { draftId, autofilled: filled.length };
    } catch (error) {
      await ctx.storage.delete(args.uploadStorageId).catch(() => undefined);
      throw error;
    }
  },
});

/** Dati per l'editor PDF: indirizzo del PDF originale, dimensioni delle pagine e testi gia' inseriti. */
export const pdfEditorData = action({
  args: { draftId: v.id("docDrafts") },
  handler: async (ctx, args): Promise<{ url: string; pages: PdfInfo["pages"]; annotations: typeof pdfAnnotation.type[] }> => {
    await admin(ctx);
    const draft = await ctx.runQuery(internal.docStudio.draftForAction, { draftId: args.draftId });
    if (!draft || draft.format !== "pdf" || !draft.originalStorageId) return invalid("bozza", "PDF non trovato.");
    const info = await checkPdf(await loadPdfBytes(ctx, draft.originalStorageId));
    const url = await ctx.storage.getUrl(draft.originalStorageId);
    if (!url) return invalid("file", "File non disponibile.");
    return { url, pages: info.pages, annotations: draft.annotations };
  },
});

/** Salva i testi sovrapposti: riparte sempre dal PDF originale e riscrive il PDF di lavoro. */
export const savePdf = action({
  args: { draftId: v.id("docDrafts"), annotations: v.array(pdfAnnotation) },
  handler: async (ctx, args): Promise<{ annotations: number }> => {
    const { actorId } = await admin(ctx);
    const draft = await ctx.runQuery(internal.docStudio.draftForAction, { draftId: args.draftId });
    if (!draft || draft.format !== "pdf" || !draft.originalStorageId) return invalid("bozza", "PDF non trovato.");
    if (draft.status === "sent") return invalid("bozza", "Il documento è già stato inviato: crea una nuova bozza per modificarlo.");
    let stamped: Uint8Array;
    let kept: typeof args.annotations;
    try {
      const original = await loadPdfBytes(ctx, draft.originalStorageId);
      kept = cleanAnnotations(args.annotations, (await inspectPdf(original)).pages.length);
      stamped = await stampPdf(original, kept);
    } catch (error) {
      if (error instanceof PdfError) return invalid("testi", error.message);
      throw error;
    }
    const storageId = await storeBlob(ctx, stamped, PDF_MIME);
    await ctx.runMutation(internal.docStudio.patchDraftFile, { draftId: args.draftId, storageId, annotations: kept, actorId });
    return { annotations: kept.length };
  },
});
