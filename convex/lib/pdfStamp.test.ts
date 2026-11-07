import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, degrees } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { cleanAnnotations, inspectPdf, MAX_ANNOTATIONS, PdfError, stampPdf, type PdfAnnotation } from "./pdfStamp";

async function samplePdf(pages = 2, rotate = 0): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const p = pdf.addPage([595.28, 841.89]);
    p.drawText(`Pagina originale ${i + 1}`, { x: 60, y: 780, size: 14 });
    if (rotate) p.setRotation(degrees(rotate));
  }
  return pdf.save();
}

type Item = { str: string; x: number; y: number };
async function textItems(bytes: Uint8Array, pageNumber: number): Promise<Item[]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true } as Parameters<typeof pdfjs.getDocument>[0]).promise;
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items
    .filter((i): i is typeof i & { str: string; transform: number[] } => "str" in i)
    .filter((i) => i.str.trim() !== "")
    .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5] }));
}

const note = (extra: Partial<PdfAnnotation> = {}): PdfAnnotation => ({ page: 0, x: 0.25, y: 0.5, text: "Mario Rossi", size: 12, color: "black", bold: false, ...extra });

describe("inspectPdf", () => {
  it("restituisce le dimensioni delle pagine", async () => {
    const info = await inspectPdf(await samplePdf(3));
    expect(info.pages).toHaveLength(3);
    expect(info.pages[0].width).toBeCloseTo(595.28, 1);
  });

  it("rifiuta i PDF con pagine ruotate (le coordinate non corrisponderebbero)", async () => {
    await expect(inspectPdf(await samplePdf(2, 90))).rejects.toThrow(/ruotate/);
  });

  it("rifiuta file che non sono PDF, PDF rovinati, troppo piccoli o troppo grandi", async () => {
    await expect(inspectPdf(new TextEncoder().encode("non sono un pdf ".repeat(20)))).rejects.toThrow(PdfError);
    await expect(inspectPdf(new TextEncoder().encode("%PDF-1.7\n".repeat(40)))).rejects.toThrow(/non è un PDF valido/);
    await expect(inspectPdf(new Uint8Array(20 * 1024 * 1024))).rejects.toThrow(PdfError);
  });
});

describe("stampPdf", () => {
  it("scrive il testo nel punto indicato (frazioni della pagina, origine in alto a sinistra)", async () => {
    const out = await stampPdf(await samplePdf(), [note()]);
    const items = await textItems(out, 1);
    const stamped = items.find((i) => i.str === "Mario Rossi")!;
    expect(stamped).toBeDefined();
    // x = 25% della larghezza; la linea di base sta sotto il bordo alto della casella (50% dell'altezza) di ~0,95 x il corpo.
    expect(stamped.x).toBeCloseTo(0.25 * 595.28, 0);
    expect(stamped.y).toBeCloseTo(841.89 * 0.5 - 12 * 0.9465, 0);
    // Il testo originale e' ancora li'.
    expect(items.some((i) => i.str.includes("Pagina originale 1"))).toBe(true);
  });

  it("scrive sulla pagina giusta, su piu' righe, con grassetto e senza toccare l'originale", async () => {
    const original = await samplePdf(2);
    const copy = original.slice();
    const out = await stampPdf(original, [note({ page: 1, text: "Riga uno\nRiga due", bold: true, size: 20 })]);
    expect(original).toEqual(copy);
    const page1 = await textItems(out, 1);
    expect(page1.some((i) => i.str.includes("Riga"))).toBe(false);
    const page2 = await textItems(out, 2);
    const one = page2.find((i) => i.str === "Riga uno")!;
    const two = page2.find((i) => i.str === "Riga due")!;
    expect(one.y - two.y).toBeCloseTo(20 * 1.2, 0);
  });

  it("gestisce caratteri speciali e accenti senza errori", async () => {
    const out = await stampPdf(await samplePdf(1), [note({ text: "Caffè “Rosso” €5 – ☒ 😀" })]);
    const items = await textItems(out, 1);
    expect(items.some((i) => i.str.includes("Caffè"))).toBe(true);
  });

  it("senza annotazioni restituisce un PDF equivalente", async () => {
    const out = await stampPdf(await samplePdf(2), []);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });
});

describe("controlli sulle annotazioni", () => {
  it("normalizza posizione, corpo e colore; ignora i testi vuoti", () => {
    const [a] = cleanAnnotations([note({ x: -3, y: 9, size: 500, color: "viola" as never }), note({ text: "   " })], 1);
    expect(a).toMatchObject({ x: 0, y: 1, size: 48, color: "black" });
    expect(cleanAnnotations([note({ text: "   " })], 1)).toEqual([]);
  });

  it("rifiuta pagina inesistente, valori non numerici e troppi testi", () => {
    expect(() => cleanAnnotations([note({ page: 2 })], 2)).toThrow(/Pagina non valida/);
    expect(() => cleanAnnotations([note({ page: -1 })], 2)).toThrow(PdfError);
    expect(() => cleanAnnotations([note({ x: Number.NaN })], 1)).toThrow(/Posizione non valida/);
    expect(() => cleanAnnotations(Array.from({ length: MAX_ANNOTATIONS + 1 }, () => note()), 1)).toThrow(/Troppi testi/);
  });

  it("tronca i testi troppo lunghi", () => {
    expect(cleanAnnotations([note({ text: "a".repeat(5000) })], 1)[0].text).toHaveLength(2000);
  });
});
