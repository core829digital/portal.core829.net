import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { strFromU8, strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { renderPdf, printable } from "./docPdf";
import {
  applyChanges,
  createBlankDocx,
  detectFields,
  DocxError,
  listParagraphs,
  readDocx,
  toModel,
  writeDocx,
  type DocxFiles,
} from "./docx";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** DOCX con un'unica riga "etichetta | valore" in tabella e un paragrafo con testo diviso in due pezzi (grassetto + normale). */
function sample(): DocxFiles {
  const files = readDocx(
    createBlankDocx([
      { type: "title", text: "Contratto" },
      { type: "p", text: "Data: [GG/MM/AAAA] firma ______ ☐ accetto" },
      { type: "table", rows: [["Cliente", "{{client.name}}"], ["Note", "___"]] },
      { type: "p", text: "Fine" },
    ]),
  );
  return files;
}

const text = (files: DocxFiles) => listParagraphs(files).map((p) => p.text);

describe("lettura e creazione", () => {
  it("crea un DOCX valido e ne elenca i paragrafi con stile e tabella", () => {
    const paragraphs = listParagraphs(sample());
    expect(paragraphs[0]).toMatchObject({ text: "Contratto", style: "Title", inTable: false });
    const cell = paragraphs.find((p) => p.text === "{{client.name}}");
    expect(cell).toMatchObject({ inTable: true, rowLabel: "Cliente" });
  });

  it("rifiuta file che non sono DOCX (firma, struttura, dimensione, zip bomb)", () => {
    expect(() => readDocx(strToU8("questo non e' un docx ".repeat(10)))).toThrow(DocxError);
    expect(() => readDocx(zipSync({ "altro.txt": strToU8("x".repeat(200)) }))).toThrow(/documento Word/);
    expect(() => readDocx(new Uint8Array(20 * 1024 * 1024))).toThrow(DocxError);
    // Un file piccolo che da' decompresso molto piu' di 80 MB.
    const bomb = zipSync({ "word/document.xml": new Uint8Array(100 * 1024 * 1024) }, { level: 9 });
    expect(bomb.length).toBeLessThan(1024 * 1024);
    expect(() => readDocx(bomb)).toThrow(/troppo grande/);
  });
});

describe("campi da compilare", () => {
  it("riconosce righe, testo tra parentesi, caselle e segnaposto, con etichetta di riga", () => {
    const fields = detectFields(listParagraphs(sample()));
    expect(fields.map((f) => [f.kind, f.token])).toEqual([
      ["blank", "[GG/MM/AAAA]"],
      ["blank", "______"],
      ["checkbox", "☐"],
      ["variable", "{{client.name}}"],
      ["blank", "___"],
    ]);
    expect(fields.find((f) => f.key === "client.name")?.label).toBe("Cliente");
    expect(fields[2].label).toBe("accetto");
  });

  it("compila solo i campi indicati, spunta le caselle e lascia com'e' un campo vuoto", () => {
    const files = sample();
    const fields = detectFields(listParagraphs(files));
    const out = applyChanges(files, {
      fills: { [fields[0].id]: "12/11/2026", [fields[1].id]: "", [fields[2].id]: "true", [fields[3].id]: "Mario <Rossi> & Figli" },
    });
    expect(text(out)).toContain("Data: 12/11/2026 firma ______ ☒ accetto");
    // Il testo inserito e' solo testo: i caratteri speciali dell'XML non lo rompono e non diventano markup.
    expect(text(out)).toContain("Mario <Rossi> & Figli");
    const reread = listParagraphs(readDocx(writeDocx(out)));
    expect(reread.map((p) => p.text)).toContain("Mario <Rossi> & Figli");
    // L'originale non cambia.
    expect(text(files)).toContain("{{client.name}}");
  });

  it("sostituisce un segnaposto diviso in piu' pezzi di testo mantenendo la formattazione del primo", () => {
    const files = sample();
    const xml = strFromU8(files["word/document.xml"]).replace(
      "<w:p><w:r><w:t xml:space=\"preserve\">Fine</w:t></w:r></w:p>",
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Totale: {{amo</w:t></w:r><w:r><w:t xml:space="preserve">unt}} euro</w:t></w:r></w:p>`,
    );
    const split = { ...files, "word/document.xml": strToU8(xml) };
    expect(text(split)).toContain("Totale: {{amount}} euro");
    const out = applyChanges(split, { vars: { amount: "1.200,00" } });
    expect(text(out)).toContain("Totale: 1.200,00 euro");
    expect(strFromU8(out["word/document.xml"])).toMatch(/<w:b\/>.{0,40}Totale: 1\.200,00/);
  });
});

describe("modifiche al testo", () => {
  it("riscrive, aggiunge ed elimina paragrafi; in una cella l'ultimo paragrafo si svuota ma non sparisce", () => {
    const files = sample();
    const paragraphs = listParagraphs(files);
    const title = paragraphs.findIndex((p) => p.text === "Contratto");
    const note = paragraphs.findIndex((p) => p.text === "___");
    const end = paragraphs.findIndex((p) => p.text === "Fine");
    const out = applyChanges(files, {
      edits: { [title]: "Contratto di servizi" },
      inserts: { [end]: ["Riga A", "Riga B"] },
      deletes: [note, paragraphs.findIndex((p) => p.text === "Data: [GG/MM/AAAA] firma ______ ☐ accetto")],
    });
    const after = text(out);
    expect(after[0]).toBe("Contratto di servizi");
    expect(after.slice(-3)).toEqual(["Fine", "Riga A", "Riga B"]);
    expect(after).not.toContain("Data: [GG/MM/AAAA] firma ______ ☐ accetto");
    expect(after).toContain(""); // la cella "Note" e' stata svuotata, non rimossa
    // Il documento resta apribile: stesso numero di tabelle e righe.
    expect(strFromU8(out["word/document.xml"]).match(/<w:tr>/g)?.length).toBe(2);
    expect(after[0]).toBe(listParagraphs(readDocx(writeDocx(out)))[0].text);
  });

  it("applica i segnaposto anche in intestazioni e piè di pagina", () => {
    const files = sample();
    const header = `<?xml version="1.0"?><w:hdr xmlns:w="${W}"><w:p><w:r><w:t>Contratto n. {{contract.number}}</w:t></w:r></w:p></w:hdr>`;
    const out = applyChanges({ ...files, "word/header1.xml": strToU8(header) }, { vars: { "contract.number": "2026-014" } });
    expect(strFromU8(out["word/header1.xml"])).toContain("Contratto n. 2026-014");
  });

  it("toglie i caratteri di controllo dal testo inserito", () => {
    const files = sample();
    const out = applyChanges(files, { edits: { 0: "Titolo\u0000con\u0007controllo" } });
    expect(text(out)[0]).toBe("Titolocon" + "controllo");
  });
});

describe("PDF", () => {
  it("genera un PDF valido da testo e tabelle, anche con caratteri speciali", async () => {
    const files = applyChanges(sample(), { vars: { "client.name": "Caffè “Rosso” €5 — ☒ 😀" } });
    const bytes = await renderPdf(toModel(files), { title: "Contratto" });
    expect(strFromU8(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getTitle()).toBe("Contratto");
  });

  it("divide su piu' pagine un testo lungo e una tabella molto alta", async () => {
    const long = createBlankDocx([
      { type: "p", text: "Parola ".repeat(3000) },
      { type: "table", rows: [["Voce", Array.from({ length: 220 }, (_, i) => `riga ${i}`).join("\n")]] },
    ]);
    const pdf = await PDFDocument.load(await renderPdf(toModel(readDocx(long)), { title: "Lungo" }));
    expect(pdf.getPageCount()).toBeGreaterThan(3);
  });

  it("sostituisce i caratteri non scrivibili e le caselle", () => {
    const set = new Set<number>(Array.from({ length: 95 }, (_, i) => 32 + i));
    expect(printable("☐ ok ☒ “a”\t😀", set)).toBe('[  ] ok [x] "a"    ?');
  });
});

// Prova sul contratto vero (MSA) se il file e' presente in locale: non fa parte del repository.
const REAL = process.env.MSA_FIXTURE ?? "/tmp/msa/msa.docx";
describe.skipIf(!existsSync(REAL))("contratto MSA reale (solo in locale)", () => {
  it("lo legge, trova i campi, lo compila e ne fa un PDF", async () => {
    const files = readDocx(new Uint8Array(readFileSync(REAL)));
    const paragraphs = listParagraphs(files);
    const fields = detectFields(paragraphs);
    expect(paragraphs.length).toBeGreaterThan(500);
    expect(fields.length).toBeGreaterThan(10);
    const fills: Record<string, string> = {};
    for (const f of fields.slice(0, 5)) fills[f.id] = f.kind === "checkbox" ? "true" : "PROVA";
    const out = applyChanges(files, { fills });
    expect(listParagraphs(readDocx(writeDocx(out))).length).toBe(paragraphs.length);
    const pdfBytes = await renderPdf(toModel(out), { title: "MSA" });
    if (process.env.MSA_PDF_OUT) writeFileSync(process.env.MSA_PDF_OUT, pdfBytes);
    const pdf = await PDFDocument.load(pdfBytes);
    expect(pdf.getPageCount()).toBeGreaterThan(10);
    console.log(`MSA: ${paragraphs.length} paragrafi, ${fields.length} campi, ${pdf.getPageCount()} pagine PDF`);
  });
});
