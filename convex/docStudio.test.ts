/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { PDFDocument, degrees } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createBlankDocx, detectFields, listParagraphs, readDocx } from "./lib/docx";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|s1`, issuer: "https://test.local", tokenIdentifier: `https://test.local|${userId}|s1` });
}

async function setup() {
  const t = convexTest(schema, modules);
  const adminId = await t.run(async (ctx) => {
    await ctx.db.insert("admins", { email: "stefan@core829.net", addedAt: Date.now() });
    return ctx.db.insert("users", { email: "stefan@core829.net", emailVerificationTime: Date.now() });
  });
  const otherId = await t.run((ctx) => ctx.db.insert("users", { email: "altro@esempio.it", emailVerificationTime: Date.now() }));
  const clientId = await t.run((ctx) =>
    ctx.db.insert("clients", { displayName: "Caffè Rosso Srl", contactName: "Mario Rossi", email: "mario@caffe.it", phone: "+39 333 1112223", packageType: "custom", status: "active" }),
  );
  return { t, admin: asUser(t, adminId), other: asUser(t, otherId), clientId };
}

const sampleDocx = () =>
  createBlankDocx([
    { type: "title", text: "Contratto n. {{contract.number}}" },
    { type: "p", text: "Cliente: {{client.name}} — referente {{client.contact}}" },
    { type: "p", text: "Firma: ________ ☐ accetto" },
  ]);

async function store(t: ReturnType<typeof convexTest>, bytes: Uint8Array, type = DOCX) {
  return t.run((ctx) => ctx.storage.store(new Blob([bytes as BlobPart], { type })));
}

async function bytesOf(t: ReturnType<typeof convexTest>, id: Id<"_storage">) {
  const data = await t.run(async (ctx) => {
    const blob = await ctx.storage.get(id);
    return blob ? Array.from(new Uint8Array(await blob.arrayBuffer())) : null;
  });
  return new Uint8Array(data!);
}

const exists = (t: ReturnType<typeof convexTest>, id: Id<"_storage">) => t.run(async (ctx) => (await ctx.storage.get(id)) !== null);

async function template(h: Awaited<ReturnType<typeof setup>>) {
  const storageId = await store(h.t, sampleDocx());
  return h.admin.action(api.docStudioActions.importTemplate, { storageId, name: "MSA di prova", category: "contract" });
}

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_chiave_di_prova";
  process.env.AUTH_EMAIL_FROM = "CORE829 <portal@core829.net>";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.AUTH_EMAIL_FROM;
});

describe("modelli", () => {
  it("importa un DOCX valido e conta paragrafi e campi", async () => {
    const h = await setup();
    const r = await template(h);
    expect(r.paragraphs).toBe(3);
    expect(r.fields).toBe(5);
    const list = await h.admin.query(api.docStudio.listTemplates, {});
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "MSA di prova", category: "contract", fieldCount: 5 });
  });

  it("rifiuta un file che non e' un DOCX e non lo lascia in archivio", async () => {
    const h = await setup();
    const storageId = await store(h.t, new TextEncoder().encode("non sono un docx ".repeat(20)), "text/plain");
    await expect(h.admin.action(api.docStudioActions.importTemplate, { storageId, name: "X", category: "other" })).rejects.toThrow();
    expect(await exists(h.t, storageId)).toBe(false);
    expect(await h.admin.query(api.docStudio.listTemplates, {})).toHaveLength(0);
  });

  it("archivia un modello (sparisce dall'elenco)", async () => {
    const h = await setup();
    const { templateId } = await template(h);
    await h.admin.mutation(api.docStudio.archiveTemplate, { templateId });
    expect(await h.admin.query(api.docStudio.listTemplates, {})).toHaveLength(0);
  });
});

describe("bozze", () => {
  it("crea la bozza dal modello con i dati del cliente gia' inseriti; resta da compilare il resto", async () => {
    const h = await setup();
    const { templateId } = await template(h);
    const { draftId } = await h.admin.action(api.docStudioActions.createDraft, { clientId: h.clientId, templateId });
    const { paragraphs, fields } = await h.admin.action(api.docStudioActions.inspectDraft, { draftId });
    expect(paragraphs.map((p) => p.text)).toEqual([
      `Contratto n. CTR-${new Date().getUTCFullYear()}-001`,
      "Cliente: Caffè Rosso Srl — referente Mario Rossi",
      "Firma: ________ ☐ accetto",
    ]);
    expect(fields.map((f) => f.kind)).toEqual(["blank", "checkbox"]);
    const draft = await h.admin.query(api.docStudio.getDraft, { draftId });
    expect(draft).toMatchObject({ name: "MSA di prova — Caffè Rosso Srl", status: "draft", client: { displayName: "Caffè Rosso Srl" } });
  });

  it("crea la bozza anche da un DOCX caricato; serve una sola origine", async () => {
    const h = await setup();
    const uploadStorageId = await store(h.t, sampleDocx());
    const { draftId } = await h.admin.action(api.docStudioActions.createDraft, { clientId: h.clientId, uploadStorageId, name: "Documento caricato", category: "other" });
    expect((await h.admin.query(api.docStudio.listDrafts, { clientId: h.clientId }))[0]).toMatchObject({ id: draftId, name: "Documento caricato" });
    // Il file caricato e' stato sostituito da una copia di lavoro.
    expect(await exists(h.t, uploadStorageId)).toBe(false);
    await expect(h.admin.action(api.docStudioActions.createDraft, { clientId: h.clientId })).rejects.toThrow();
  });

  it("salva modifiche e campi compilati in un nuovo file e toglie quello vecchio", async () => {
    const h = await setup();
    const { templateId } = await template(h);
    const { draftId } = await h.admin.action(api.docStudioActions.createDraft, { clientId: h.clientId, templateId });
    const before = (await h.t.run((ctx) => ctx.db.get("docDrafts", draftId)))!.storageId;
    const { fields } = await h.admin.action(api.docStudioActions.inspectDraft, { draftId });
    await h.admin.action(api.docStudioActions.saveDraft, {
      draftId,
      edits: [{ index: 0, text: "Master Services Agreement" }],
      deletes: [],
      inserts: [{ after: 2, texts: ["Luogo e data: Roman, 12/11/2026"] }],
      fills: [{ id: fields[0].id, value: "Mario Rossi" }, { id: fields[1].id, value: "true" }],
    });
    const after = (await h.t.run((ctx) => ctx.db.get("docDrafts", draftId)))!.storageId;
    expect(after).not.toBe(before);
    expect(await exists(h.t, before)).toBe(false);
    const texts = listParagraphs(readDocx(await bytesOf(h.t, after))).map((p) => p.text);
    expect(texts).toEqual(["Master Services Agreement", "Cliente: Caffè Rosso Srl — referente Mario Rossi", "Firma: Mario Rossi ☒ accetto", "Luogo e data: Roman, 12/11/2026"]);
    expect(detectFields(listParagraphs(readDocx(await bytesOf(h.t, after)))).length).toBe(0);
  });

  it("l'anteprima PDF e' un PDF vero e il DOCX si scarica", async () => {
    const h = await setup();
    const { templateId } = await template(h);
    const { draftId } = await h.admin.action(api.docStudioActions.createDraft, { clientId: h.clientId, templateId });
    const pdf = await h.admin.action(api.docStudioActions.previewDraft, { draftId, format: "pdf" });
    expect(pdf.fileName).toMatch(/\.pdf$/);
    const stored = (await h.t.run((ctx) => ctx.db.get("docDrafts", draftId)))!.previewStorageId!;
    expect(new TextDecoder().decode((await bytesOf(h.t, stored)).slice(0, 5))).toBe("%PDF-");
    expect((await h.admin.action(api.docStudioActions.previewDraft, { draftId, format: "docx" })).fileName).toMatch(/\.docx$/);
  });

  it("elimina una bozza non inviata", async () => {
    const h = await setup();
    const { templateId } = await template(h);
    const { draftId } = await h.admin.action(api.docStudioActions.createDraft, { clientId: h.clientId, templateId });
    await h.admin.mutation(api.docStudio.deleteDraft, { draftId });
    expect(await h.admin.query(api.docStudio.getDraft, { draftId })).toBeNull();
  });
});

describe("invio al cliente", () => {
  async function ready() {
    const h = await setup();
    const { templateId } = await template(h);
    const { draftId } = await h.admin.action(api.docStudioActions.createDraft, { clientId: h.clientId, templateId });
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    return { h, draftId, fetchMock };
  }
  const args = (draftId: Id<"docDrafts">, extra: Record<string, unknown> = {}) => ({
    draftId,
    to: "mario@caffe.it",
    subject: "Il tuo contratto CORE829",
    message: "Buongiorno Mario,\nin allegato il contratto da firmare <b>grazie</b>.",
    formats: ["pdf", "docx"] as ("pdf" | "docx")[],
    ...extra,
  });

  it("spedisce PDF e DOCX in allegato con Resend, poi li archivia nel fascicolo del cliente", async () => {
    const { h, draftId, fetchMock } = await ready();
    expect(await h.admin.action(api.docStudioActions.sendDraft, args(draftId))).toEqual({ sentTo: "mario@caffe.it", attachments: 2 });

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.to).toEqual(["mario@caffe.it"]);
    expect(body.reply_to).toBe("office@core829.net");
    expect(body.attachments.map((a: { filename: string }) => a.filename)).toEqual(["MSA di prova - Caffe Rosso Srl.pdf", "MSA di prova - Caffe Rosso Srl.docx"]);
    expect(Buffer.from(body.attachments[0].content, "base64").subarray(0, 5).toString()).toBe("%PDF-");
    expect(Buffer.from(body.attachments[1].content, "base64").subarray(0, 2).toString()).toBe("PK");
    // Il messaggio e' testo: il codice HTML scritto dall'admin non viene interpretato.
    expect(body.html).toContain("&lt;b&gt;grazie&lt;/b&gt;");
    expect(body.html).not.toContain("<b>grazie</b>");
    expect(JSON.stringify(body)).not.toContain("re_chiave_di_prova");

    const docs = await h.t.run((ctx) => ctx.db.query("documents").collect());
    expect(docs).toHaveLength(2);
    expect(docs.every((d) => d.clientId === h.clientId && d.kind === "contract" && d.scanStatus === "clean" && d.visibleToClient)).toBe(true);
    const draft = await h.admin.query(api.docStudio.getDraft, { draftId });
    expect(draft).toMatchObject({ status: "sent", sentTo: "mario@caffe.it" });
    const log = await h.t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(log.some((l) => l.action === "doc.sent")).toBe(true);
  });

  it("un documento inviato non si reinvia, non si modifica e non si elimina", async () => {
    const { h, draftId } = await ready();
    await h.admin.action(api.docStudioActions.sendDraft, args(draftId));
    await expect(h.admin.action(api.docStudioActions.sendDraft, args(draftId))).rejects.toThrow();
    await expect(h.admin.action(api.docStudioActions.saveDraft, { draftId, edits: [], deletes: [], inserts: [], fills: [] })).rejects.toThrow();
    await expect(h.admin.mutation(api.docStudio.deleteDraft, { draftId })).rejects.toThrow();
  });

  it("eliminare un documento inviato al cliente richiede una conferma esplicita; il riferimento nella bozza si pulisce", async () => {
    const { h, draftId } = await ready();
    await h.admin.action(api.docStudioActions.sendDraft, args(draftId));
    const docs = await h.t.run((ctx) => ctx.db.query("documents").collect());
    const target = docs[0];
    await expect(h.admin.mutation(api.documents.remove, { documentId: target._id })).rejects.toThrow();
    await expect(h.admin.mutation(api.documents.remove, { documentId: target._id, confirmSent: false })).rejects.toThrow();
    expect(await h.t.run((ctx) => ctx.db.get("documents", target._id))).not.toBeNull();
    await h.admin.mutation(api.documents.remove, { documentId: target._id, confirmSent: true });
    expect(await h.t.run((ctx) => ctx.db.get("documents", target._id))).toBeNull();
    expect(await exists(h.t, target.storageId)).toBe(false);
    const draft = (await h.t.run((ctx) => ctx.db.get("docDrafts", draftId)))!;
    expect(draft.documentIds).not.toContain(target._id);
    const log = await h.t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(log.find((l) => l.action === "document.deleted")?.metadata).toMatchObject({ wasSent: "true" });
  });

  it("un documento caricato a mano (mai inviato) si elimina senza conferma extra", async () => {
    const h = await setup();
    const storageId = await store(h.t, new Uint8Array([1, 2, 3]), "application/pdf");
    const documentId = await h.t.run((ctx) =>
      ctx.db.insert("documents", { clientId: h.clientId, title: "x", fileName: "x.pdf", kind: "other", storageId, sizeBytes: 3, mimeType: "application/pdf", scanStatus: "clean", visibleToClient: false } as never),
    );
    await h.admin.mutation(api.documents.remove, { documentId });
    expect(await exists(h.t, storageId)).toBe(false);
  });

  it("l'eliminazione di una bozza toglie tutti i file; chi non e' admin non puo' eliminare nulla", async () => {
    const h = await setup();
    const { templateId } = await template(h);
    const { draftId } = await h.admin.action(api.docStudioActions.createDraft, { clientId: h.clientId, templateId });
    await h.admin.action(api.docStudioActions.previewDraft, { draftId, format: "pdf" });
    const row = (await h.t.run((ctx) => ctx.db.get("docDrafts", draftId)))!;
    await expect(h.other.mutation(api.docStudio.deleteDraft, { draftId })).rejects.toThrow();
    expect(await h.t.run((ctx) => ctx.db.get("docDrafts", draftId))).not.toBeNull();
    await h.admin.mutation(api.docStudio.deleteDraft, { draftId });
    expect(await exists(h.t, row.storageId)).toBe(false);
    expect(await exists(h.t, row.previewStorageId!)).toBe(false);
    const log = await h.t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(log.some((l) => l.action === "doc.draft_deleted")).toBe(true);
  });

  it("se Resend rifiuta l'invio non salva nulla e la bozza resta modificabile", async () => {
    const { h, draftId } = await ready();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 403 })));
    await expect(h.admin.action(api.docStudioActions.sendDraft, args(draftId))).rejects.toThrow();
    expect(await h.t.run((ctx) => ctx.db.query("documents").collect())).toHaveLength(0);
    expect((await h.admin.query(api.docStudio.getDraft, { draftId }))?.status).toBe("draft");
  });

  it("rifiuta destinatario non valido, nessun formato e configurazione email mancante", async () => {
    const { h, draftId, fetchMock } = await ready();
    await expect(h.admin.action(api.docStudioActions.sendDraft, args(draftId, { to: "non-una-email" }))).rejects.toThrow();
    await expect(h.admin.action(api.docStudioActions.sendDraft, args(draftId, { formats: [] }))).rejects.toThrow();
    delete process.env.RESEND_API_KEY;
    await expect(h.admin.action(api.docStudioActions.sendDraft, args(draftId))).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

async function pdfBytes(pages = 2, rotate = 0): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const p = pdf.addPage([595.28, 841.89]);
    p.drawText(`Originale ${i + 1}`, { x: 60, y: 780, size: 14 });
    if (rotate) p.setRotation(degrees(rotate));
  }
  return pdf.save();
}

async function pdfTexts(bytes: Uint8Array, pageNumber: number): Promise<string[]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true } as Parameters<typeof pdfjs.getDocument>[0]).promise;
  const content = await (await doc.getPage(pageNumber)).getTextContent();
  return content.items.filter((i): i is typeof i & { str: string } => "str" in i).map((i) => i.str).filter((t) => t.trim() !== "");
}

const note = (extra: Record<string, unknown> = {}) => ({ page: 0, x: 0.3, y: 0.4, text: "Mario Rossi", size: 12, color: "black" as const, bold: false, ...extra });

describe("fogli Excel", () => {
  const csv = (text: string) => new TextEncoder().encode(text);

  it("legge un CSV, cancella sempre il file caricato e inserisce la tabella nel documento", async () => {
    const h = await setup();
    const { templateId } = await template(h);
    const { draftId } = await h.admin.action(api.docStudioActions.createDraft, { clientId: h.clientId, templateId });
    const upload = await store(h.t, csv("Metrica;Valore\nVisite;1520\nFollower;1200"), "text/csv");
    const { sheets } = await h.admin.action(api.docStudioActions.readSpreadsheet, { storageId: upload, fileName: "report.csv" });
    expect(sheets[0].rows).toEqual([["Metrica", "Valore"], ["Visite", "1520"], ["Follower", "1200"]]);
    expect(await exists(h.t, upload)).toBe(false);
    await h.admin.action(api.docStudioActions.saveDraft, { draftId, edits: [], deletes: [], inserts: [], fills: [], tables: [{ after: 0, header: true, rows: sheets[0].rows }] });
    const after = (await h.t.run((ctx) => ctx.db.get("docDrafts", draftId)))!.storageId;
    const texts = listParagraphs(readDocx(await bytesOf(h.t, after))).map((p) => p.text);
    expect(texts).toEqual(expect.arrayContaining(["Metrica", "Valore", "Visite", "1520"]));
  });

  it("file non valido o .xls: errore chiaro e file comunque cancellato; chi non e' admin non cancella nulla", async () => {
    const h = await setup();
    const bad = await store(h.t, new Uint8Array([1, 2, 3, 4]), "application/octet-stream");
    await expect(h.admin.action(api.docStudioActions.readSpreadsheet, { storageId: bad, fileName: "vecchio.xls" })).rejects.toThrow();
    expect(await exists(h.t, bad)).toBe(false);
    const mine = await store(h.t, csv("a;b"), "text/csv");
    await expect(h.other.action(api.docStudioActions.readSpreadsheet, { storageId: mine, fileName: "a.csv" })).rejects.toThrow();
    expect(await exists(h.t, mine)).toBe(true);
  });
});

describe("compilazione automatica", () => {
  const year = new Date().getUTCFullYear();

  it("compila i campi con etichetta chiara (cliente + CORE829) e numera i documenti per categoria", async () => {
    const h = await setup();
    await h.t.run((ctx) => ctx.db.patch("clients", h.clientId, { vatId: "IT01234567890", address: "Via Roma 1, Milano", pec: "caffe@pec.it", legalRep: "Mario Rossi, Amministratore" }));
    const form = createBlankDocx([
      { type: "table", rows: [["Cliente", ""], ["Sede legale", ""], ["Partita IVA", ""], ["PEC", ""], ["Rappresentante legale", ""], ["Forma giuridica", ""], ["Riferimento MSA n.", ""]] },
      { type: "p", text: "Per CORE829: {{company.rep}} — {{company.name}} — {{company.cui}}" },
    ]);
    const storageId = await store(h.t, form);
    const { templateId } = await h.admin.action(api.docStudioActions.importTemplate, { storageId, name: "Modulo", category: "contract" });
    const first = await h.admin.action(api.docStudioActions.createDraft, { clientId: h.clientId, templateId });
    expect(first).toMatchObject({ autofilled: 6, number: `CTR-${year}-001` });
    const second = await h.admin.action(api.docStudioActions.createDraft, { clientId: h.clientId, templateId });
    expect(second.number).toBe(`CTR-${year}-002`);
    const { paragraphs, fields } = await h.admin.action(api.docStudioActions.inspectDraft, { draftId: first.draftId });
    const text = paragraphs.map((p) => p.text);
    for (const expected of ["Caffè Rosso Srl", "Via Roma 1, Milano", "IT01234567890", "caffe@pec.it", "Mario Rossi, Amministratore", `CTR-${year}-001`, "Per CORE829: Stefan Serban — CORE829 SRL — 54616345"]) {
      expect(text).toContain(expected);
    }
    // Il campo ambiguo resta da compilare a mano.
    expect(fields.filter((f) => f.kind === "blank").map((f) => f.label)).toEqual(["Forma giuridica"]);
  });

  it("la numerazione e' separata per categoria", async () => {
    const h = await setup();
    const mk = async (category: "contract" | "quote") => {
      const storageId = await store(h.t, sampleDocx());
      const { templateId } = await h.admin.action(api.docStudioActions.importTemplate, { storageId, name: category, category });
      return (await h.admin.action(api.docStudioActions.createDraft, { clientId: h.clientId, templateId })).number;
    };
    expect(await mk("contract")).toBe(`CTR-${year}-001`);
    expect(await mk("quote")).toBe(`PRV-${year}-001`);
    expect(await mk("contract")).toBe(`CTR-${year}-002`);
  });

  it("PDF con campi modulo: i campi riconosciuti arrivano gia' compilati, modificabili nell'editor, l'originale resta intatto", async () => {
    const h = await setup();
    await h.t.run((ctx) => ctx.db.patch("clients", h.clientId, { vatId: "IT01234567890" }));
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([600, 800]);
    pdf.getForm().createTextField("Partita_IVA").addToPage(page, { x: 100, y: 700, width: 200, height: 18 });
    pdf.getForm().createTextField("Forma_giuridica").addToPage(page, { x: 100, y: 650, width: 200, height: 18 });
    const upload = await store(h.t, await pdf.save(), "application/pdf");
    const { draftId, autofilled } = await h.admin.action(api.docStudioActions.createPdfDraft, { clientId: h.clientId, uploadStorageId: upload, name: "Modulo", category: "other" });
    expect(autofilled).toBe(1);
    const data = await h.admin.action(api.docStudioActions.pdfEditorData, { draftId });
    expect(data.annotations).toHaveLength(1);
    expect(data.annotations[0]).toMatchObject({ page: 0, text: "IT01234567890" });
    const row = (await h.t.run((ctx) => ctx.db.get("docDrafts", draftId)))!;
    expect(row.originalStorageId).toBe(upload);
    expect((await bytesOf(h.t, upload)).length).toBeGreaterThan(0);
    expect(row.storageId).not.toBe(upload);
  });
});

describe("PDF gia' pronti (editor PDF)", () => {
  async function pdfDraft(h: Awaited<ReturnType<typeof setup>>) {
    const uploadStorageId = await store(h.t, await pdfBytes(), "application/pdf");
    const { draftId } = await h.admin.action(api.docStudioActions.createPdfDraft, { clientId: h.clientId, uploadStorageId, name: "Preventivo del fornitore", category: "quote" });
    return { draftId, uploadStorageId };
  }

  it("crea la bozza da un PDF caricato, tenendo intatto l'originale e una copia di lavoro separata", async () => {
    const h = await setup();
    const { draftId, uploadStorageId } = await pdfDraft(h);
    const row = (await h.t.run((ctx) => ctx.db.get("docDrafts", draftId)))!;
    expect(row).toMatchObject({ format: "pdf", status: "draft", category: "quote", annotations: [] });
    expect(row.originalStorageId).toBe(uploadStorageId);
    expect(row.storageId).not.toBe(uploadStorageId);
    expect((await h.admin.query(api.docStudio.getDraft, { draftId }))?.format).toBe("pdf");
    const data = await h.admin.action(api.docStudioActions.pdfEditorData, { draftId });
    expect(data.pages).toHaveLength(2);
    expect(data.annotations).toEqual([]);
    expect(data.url).toBeTruthy();
  });

  it("rifiuta file che non sono PDF e PDF con pagine ruotate, e non li lascia in archivio", async () => {
    const h = await setup();
    const fake = await store(h.t, new TextEncoder().encode("non sono un pdf ".repeat(20)), "text/plain");
    await expect(h.admin.action(api.docStudioActions.createPdfDraft, { clientId: h.clientId, uploadStorageId: fake, name: "X", category: "other" })).rejects.toThrow();
    expect(await exists(h.t, fake)).toBe(false);
    const rotated = await store(h.t, await pdfBytes(1, 90), "application/pdf");
    await expect(h.admin.action(api.docStudioActions.createPdfDraft, { clientId: h.clientId, uploadStorageId: rotated, name: "X", category: "other" })).rejects.toThrow();
    expect(await exists(h.t, rotated)).toBe(false);
    expect(await h.admin.query(api.docStudio.listDrafts, {})).toHaveLength(0);
  });

  it("salva i testi sovrapposti ripartendo sempre dall'originale", async () => {
    const h = await setup();
    const { draftId, uploadStorageId } = await pdfDraft(h);
    const original = await bytesOf(h.t, uploadStorageId);
    const before = (await h.t.run((ctx) => ctx.db.get("docDrafts", draftId)))!.storageId;

    expect(await h.admin.action(api.docStudioActions.savePdf, { draftId, annotations: [note(), note({ page: 1, text: "Seconda pagina", bold: true }), note({ text: "   " })] })).toEqual({ annotations: 2 });
    const row = (await h.t.run((ctx) => ctx.db.get("docDrafts", draftId)))!;
    expect(row.storageId).not.toBe(before);
    expect(await exists(h.t, before)).toBe(false);
    expect(row.annotations).toHaveLength(2);
    const stamped = await bytesOf(h.t, row.storageId);
    expect(await pdfTexts(stamped, 1)).toContain("Mario Rossi");
    expect(await pdfTexts(stamped, 2)).toContain("Seconda pagina");
    expect(await bytesOf(h.t, uploadStorageId)).toEqual(original); // l'originale non cambia mai

    // Un secondo salvataggio con meno testi non porta con se' quelli di prima.
    await h.admin.action(api.docStudioActions.savePdf, { draftId, annotations: [note({ text: "Solo questo" })] });
    const again = await bytesOf(h.t, (await h.t.run((ctx) => ctx.db.get("docDrafts", draftId)))!.storageId);
    expect(await pdfTexts(again, 1)).toContain("Solo questo");
    expect(await pdfTexts(again, 1)).not.toContain("Mario Rossi");
    expect(await pdfTexts(again, 2)).not.toContain("Seconda pagina");
  });

  it("rifiuta una pagina inesistente senza cambiare nulla", async () => {
    const h = await setup();
    const { draftId } = await pdfDraft(h);
    const before = (await h.t.run((ctx) => ctx.db.get("docDrafts", draftId)))!.storageId;
    await expect(h.admin.action(api.docStudioActions.savePdf, { draftId, annotations: [note({ page: 9 })] })).rejects.toThrow();
    expect((await h.t.run((ctx) => ctx.db.get("docDrafts", draftId)))!.storageId).toBe(before);
  });

  it("le funzioni del Word non si applicano a un PDF e il PDF si apre solo come PDF", async () => {
    const h = await setup();
    const { draftId } = await pdfDraft(h);
    await expect(h.admin.action(api.docStudioActions.inspectDraft, { draftId })).rejects.toThrow();
    await expect(h.admin.action(api.docStudioActions.saveDraft, { draftId, edits: [], deletes: [], inserts: [], fills: [] })).rejects.toThrow();
    await expect(h.admin.action(api.docStudioActions.previewDraft, { draftId, format: "docx" })).rejects.toThrow();
    expect((await h.admin.action(api.docStudioActions.previewDraft, { draftId, format: "pdf" })).fileName).toMatch(/\.pdf$/);
    // Il contrario: un Word non e' un PDF.
    const { templateId } = await template(h);
    const docxDraft = (await h.admin.action(api.docStudioActions.createDraft, { clientId: h.clientId, templateId })).draftId;
    await expect(h.admin.action(api.docStudioActions.pdfEditorData, { draftId: docxDraft })).rejects.toThrow();
    await expect(h.admin.action(api.docStudioActions.savePdf, { draftId: docxDraft, annotations: [] })).rejects.toThrow();
  });

  it("invia il PDF con i testi applicati come unico allegato e lo archivia nel fascicolo; poi e' bloccato", async () => {
    const h = await setup();
    const { draftId } = await pdfDraft(h);
    await h.admin.action(api.docStudioActions.savePdf, { draftId, annotations: [note({ text: "Firmato per accettazione" })] });
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    // Anche se la richiesta chiede il Word, per un PDF parte solo il PDF.
    expect(await h.admin.action(api.docStudioActions.sendDraft, { draftId, to: "mario@caffe.it", subject: "Preventivo", message: "In allegato", formats: ["docx"] })).toMatchObject({ attachments: 1 });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0].filename).toMatch(/\.pdf$/);
    expect(await pdfTexts(new Uint8Array(Buffer.from(body.attachments[0].content, "base64")), 1)).toContain("Firmato per accettazione");
    const docs = await h.t.run((ctx) => ctx.db.query("documents").collect());
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ kind: "quote", mimeType: "application/pdf", scanStatus: "clean" });
    await expect(h.admin.action(api.docStudioActions.savePdf, { draftId, annotations: [] })).rejects.toThrow();
    await expect(h.admin.mutation(api.docStudio.deleteDraft, { draftId })).rejects.toThrow();
  });

  it("eliminare una bozza PDF toglie anche il file originale", async () => {
    const h = await setup();
    const { draftId, uploadStorageId } = await pdfDraft(h);
    await h.admin.mutation(api.docStudio.deleteDraft, { draftId });
    expect(await exists(h.t, uploadStorageId)).toBe(false);
  });

  it("chi non e' amministratore non puo' usare l'editor PDF", async () => {
    const h = await setup();
    const { draftId } = await pdfDraft(h);
    const upload = await store(h.t, await pdfBytes(), "application/pdf");
    for (const caller of [h.other, h.t] as unknown as (typeof h.admin)[]) {
      await expect(caller.action(api.docStudioActions.createPdfDraft, { clientId: h.clientId, uploadStorageId: upload, name: "X", category: "other" })).rejects.toThrow();
      await expect(caller.action(api.docStudioActions.pdfEditorData, { draftId })).rejects.toThrow();
      await expect(caller.action(api.docStudioActions.savePdf, { draftId, annotations: [note()] })).rejects.toThrow();
    }
    expect((await h.t.run((ctx) => ctx.db.get("docDrafts", draftId)))!.annotations).toEqual([]);
  });
});

describe("accesso", () => {
  it("chi non e' amministratore (o non ha fatto l'accesso) non puo' fare nulla", async () => {
    const h = await setup();
    const { templateId } = await template(h);
    const { draftId } = await h.admin.action(api.docStudioActions.createDraft, { clientId: h.clientId, templateId });
    const storageId = await store(h.t, sampleDocx());
    // Se un controllo mancasse, l'invio "riuscirebbe": per questo si simula Resend e si verifica che nessuna email parta.
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    for (const caller of [h.other, h.t] as unknown as (typeof h.admin)[]) {
      await expect(caller.query(api.docStudio.listTemplates, {})).rejects.toThrow();
      await expect(caller.query(api.docStudio.listDrafts, {})).rejects.toThrow();
      await expect(caller.query(api.docStudio.getDraft, { draftId })).rejects.toThrow();
      await expect(caller.mutation(api.docStudio.uploadUrl, {})).rejects.toThrow();
      await expect(caller.mutation(api.docStudio.archiveTemplate, { templateId })).rejects.toThrow();
      await expect(caller.mutation(api.docStudio.deleteDraft, { draftId })).rejects.toThrow();
      await expect(caller.action(api.docStudioActions.importTemplate, { storageId, name: "X", category: "other" })).rejects.toThrow();
      await expect(caller.action(api.docStudioActions.createDraft, { clientId: h.clientId, templateId })).rejects.toThrow();
      await expect(caller.action(api.docStudioActions.inspectDraft, { draftId })).rejects.toThrow();
      await expect(caller.action(api.docStudioActions.previewDraft, { draftId, format: "pdf" })).rejects.toThrow();
      await expect(caller.action(api.docStudioActions.sendDraft, args2(draftId))).rejects.toThrow();
      await expect(caller.action(api.docStudioActions.saveDraft, { draftId, edits: [], deletes: [], inserts: [], fills: [] })).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await h.t.run((ctx) => ctx.db.query("documents").collect())).toHaveLength(0);
    expect((await h.admin.query(api.docStudio.getDraft, { draftId }))?.status).toBe("draft");
  });
});

const args2 = (draftId: Id<"docDrafts">) => ({ draftId, to: "a@b.it", subject: "x", message: "y", formats: ["pdf" as const] });
