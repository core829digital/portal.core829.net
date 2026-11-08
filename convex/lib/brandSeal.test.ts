import { PDFDocument, PDFName, PDFRawStream, PDFDict, PDFNumber } from "pdf-lib";
import { strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { pngSize, sealPdf, coreLogoBytes, serverLogoBytes } from "./brandSeal";
import { applyChanges, createBlankDocx, listParagraphs, readDocx, toModel, writeDocx } from "./docx";
import { decorateDocx } from "./docxBrand";
import { renderPdf } from "./docPdf";
import { makePng } from "../../test/testPng";

const STAMP = makePng(40, 40, [0, 0, 200, 255]);
const SIGN = makePng(60, 20, [20, 20, 120, 255]);
const brand = { stamp: STAMP, signature: SIGN };

/** Conta le immagini del PDF per dimensioni (larghezza x altezza). */
async function images(bytes: Uint8Array): Promise<string[]> {
  const pdf = await PDFDocument.load(bytes);
  const out: string[] = [];
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype")) === PDFName.of("Image")) {
      const d: PDFDict = obj.dict;
      out.push(`${(d.get(PDFName.of("Width")) as PDFNumber).asNumber()}x${(d.get(PDFName.of("Height")) as PDFNumber).asNumber()}`);
    }
  }
  return out;
}
const count = (list: string[], dim: string) => list.filter((x) => x === dim).length;

describe("png", () => {
  it("riconosce un PNG vero e le sue dimensioni, rifiuta il resto", () => {
    expect(pngSize(STAMP)).toEqual({ width: 40, height: 40 });
    expect(pngSize(coreLogoBytes())).not.toBeNull();
    expect(pngSize(serverLogoBytes())).not.toBeNull();
    expect(pngSize(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(pngSize(new TextEncoder().encode("<svg></svg>".padEnd(60, " ")))).toBeNull();
    const jpegLike = new Uint8Array(60);
    jpegLike.set([0xff, 0xd8, 0xff]);
    expect(pngSize(jpegLike)).toBeNull();
  });
});

describe("PDF generato dal Word", () => {
  const blocks = [{ type: "title" as const, text: "Contratto" }, { type: "p" as const, text: "Testo" }];
  const model = () => toModel(readDocx(createBlankDocx(blocks)));

  it("ha i due loghi su ogni pagina e firma + timbro in fondo", async () => {
    const long = readDocx(createBlankDocx(Array.from({ length: 120 }, (_, i) => ({ type: "p" as const, text: `Paragrafo ${i} con un po' di testo per riempire le pagine del documento.` }))));
    const bytes = await renderPdf(toModel(long), { title: "T", brand });
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    expect(pages).toBeGreaterThan(1);
    const imgs = await images(bytes);
    // I loghi sono incorporati una volta e usati su ogni pagina; firma e timbro una volta sola.
    expect(count(imgs, "40x40")).toBe(1);
    expect(count(imgs, "60x20")).toBe(1);
    const content = (await PDFDocument.load(bytes)).getPages().map((p) => (p.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict)?.keys().length ?? 0));
    expect(content.every((n) => n >= 2)).toBe(true); // ogni pagina ha almeno i 2 loghi
  });
  it("senza firma e timbro il documento esce comunque con i due loghi", async () => {
    const imgs = await images(await renderPdf(model(), { title: "T" }));
    expect(count(imgs, "40x40")).toBe(0);
    expect(imgs.length).toBeGreaterThanOrEqual(2);
  });
});

describe("PDF caricato", () => {
  async function original(pages = 2) {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < pages; i++) pdf.addPage([595.28, 841.89]).drawText(`Pagina ${i + 1}`, { x: 60, y: 780, size: 14 });
    return pdf.save();
  }
  it("aggiunge in coda una pagina con firma e timbro e non tocca le altre", async () => {
    const src = await original();
    const out = await sealPdf(src, brand);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
    const imgs = await images(out);
    expect(count(imgs, "40x40")).toBe(1);
    expect(count(imgs, "60x20")).toBe(1);
    // Le prime due pagine non hanno immagini.
    expect(doc.getPages().slice(0, 2).map((p) => p.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict)?.keys().length ?? 0)).toEqual([0, 0]);
    expect(doc.getPages()[2].node.Resources()?.lookup(PDFName.of("XObject"), PDFDict)?.keys().length).toBeGreaterThanOrEqual(4);
  });
  it("senza firma e timbro il file resta identico", async () => {
    const src = await original();
    expect(await sealPdf(src, {})).toBe(src);
    expect(await sealPdf(src, undefined)).toBe(src);
  });
});

describe("Word in uscita", () => {
  const base = () => readDocx(createBlankDocx([{ type: "title", text: "Contratto" }, { type: "p", text: "Testo {{client.name}}" }]));

  it("mette i loghi in cima e firma+timbro in fondo, e resta un Word valido e leggibile", () => {
    const out = decorateDocx(base(), brand);
    for (const f of ["brand-core.png", "brand-server.png", "brand-stamp.png", "brand-signature.png"]) expect(out[`word/media/${f}`]).toBeDefined();
    const xml = strFromU8(out["word/document.xml"]);
    expect((xml.match(/<w:drawing>/g) ?? []).length).toBe(4);
    expect(xml.indexOf("Logo CORE829")).toBeLessThan(xml.indexOf("Contratto"));
    expect(xml.indexOf("Contratto")).toBeLessThan(xml.indexOf("Timbro CORE829"));
    expect(strFromU8(out["[Content_Types].xml"])).toContain('Extension="png"');
    expect(strFromU8(out["word/_rels/document.xml.rels"])).toContain("media/brand-stamp.png");
    const reopened = readDocx(writeDocx(out));
    expect(listParagraphs(reopened).some((p) => p.text.includes("Per CORE829 SRL"))).toBe(true);
    expect(() => applyChanges(reopened, { vars: { "client.name": "X" } })).not.toThrow();
  });
  it("e' sicuro da ripetere e senza firma/timbro mette solo i loghi", () => {
    const once = decorateDocx(base(), brand);
    expect(decorateDocx(once, brand)).toBe(once);
    const logosOnly = decorateDocx(base(), {});
    expect((strFromU8(logosOnly["word/document.xml"]).match(/<w:drawing>/g) ?? []).length).toBe(2);
    expect(logosOnly["word/media/brand-stamp.png"]).toBeUndefined();
  });
  it("un PNG di firma non valido viene ignorato senza rompere il documento", () => {
    const out = decorateDocx(base(), { stamp: new Uint8Array([1, 2, 3]), signature: SIGN });
    expect(out["word/media/brand-stamp.png"]).toBeUndefined();
    expect(out["word/media/brand-signature.png"]).toBeDefined();
  });
});
