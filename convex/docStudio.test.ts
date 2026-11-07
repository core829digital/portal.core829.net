/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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
      "Contratto n. {{contract.number}}",
      "Cliente: Caffè Rosso Srl — referente Mario Rossi",
      "Firma: ________ ☐ accetto",
    ]);
    expect(fields.map((f) => f.kind)).toEqual(["variable", "blank", "checkbox"]);
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
      fills: [{ id: fields[1].id, value: "Mario Rossi" }, { id: fields[2].id, value: "true" }],
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
