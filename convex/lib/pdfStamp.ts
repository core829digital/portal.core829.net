import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { printable } from "./docPdf";

/**
 * Scrittura di testi sopra un PDF gia' pronto ("editor PDF"). Funzioni pure, testabili.
 *
 * Le annotazioni usano coordinate RELATIVE alla pagina (frazioni da 0 a 1, origine in alto a sinistra): cosi'
 * l'editor nel browser e il PDF finale concordano qualunque sia lo zoom. Il PDF originale non si modifica: ogni
 * salvataggio riparte dall'originale e riapplica tutte le annotazioni.
 *
 * LIMITI NOTI: solo testo (font Helvetica, normale o grassetto, caratteri latini); niente PDF protetti da password ne'
 * pagine ruotate (le coordinate non corrisponderebbero); niente modifica del testo gia' presente nel PDF.
 */

import { BASELINE, LINE_HEIGHT, MAX_ANNOTATION_CHARS, MAX_ANNOTATIONS, MAX_PDF_BYTES, MAX_PDF_PAGES, MAX_SIZE, MIN_SIZE, type AnnotationColor, type PdfAnnotation } from "./pdfAnnotations";
export { BASELINE, LINE_HEIGHT, MAX_ANNOTATION_CHARS, MAX_ANNOTATIONS, MAX_PDF_BYTES, MAX_PDF_PAGES, MAX_SIZE, MIN_SIZE };
export type { AnnotationColor, PdfAnnotation };

export class PdfError extends Error {}

const COLORS: Record<AnnotationColor, [number, number, number]> = {
  black: [0.08, 0.08, 0.08],
  graphite: [0.29, 0.29, 0.29],
  red: [0.867, 0.102, 0.169],
  blue: [0.1, 0.25, 0.7],
};

export type PdfInfo = { pages: { width: number; height: number }[] };

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  if (bytes.length < 100 || bytes.length > MAX_PDF_BYTES) throw new PdfError("Il file non è un PDF valido o supera i 15 MB.");
  if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) throw new PdfError("Il file non è un PDF valido.");
  try {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    pdf.getPageCount(); // un PDF rovinato senza albero delle pagine fallisce qui, non piu' avanti
    return pdf;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("encrypted")) throw new PdfError("Il PDF è protetto da password: toglila prima di caricarlo.");
    throw new PdfError("Il file non è un PDF valido.");
  }
}

/** Controlla che il PDF si possa usare nell'editor e ne restituisce le dimensioni delle pagine (in punti). */
export async function inspectPdf(bytes: Uint8Array): Promise<PdfInfo> {
  const pdf = await load(bytes);
  const pages = pdf.getPages();
  if (pages.length === 0) throw new PdfError("Il PDF non ha pagine.");
  if (pages.length > MAX_PDF_PAGES) throw new PdfError(`Il PDF ha troppe pagine (massimo ${MAX_PDF_PAGES}).`);
  for (const page of pages) {
    if (page.getRotation().angle % 360 !== 0) throw new PdfError("Il PDF ha pagine ruotate: non sono supportate. Salvalo di nuovo senza rotazioni.");
  }
  return { pages: pages.map((p) => ({ width: p.getWidth(), height: p.getHeight() })) };
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Controlla e normalizza le annotazioni ricevute dal browser (mai fidarsi dei valori). */
export function cleanAnnotations(raw: PdfAnnotation[], pageCount: number): PdfAnnotation[] {
  if (raw.length > MAX_ANNOTATIONS) throw new PdfError(`Troppi testi (massimo ${MAX_ANNOTATIONS}).`);
  const out: PdfAnnotation[] = [];
  for (const a of raw) {
    if (!Number.isInteger(a.page) || a.page < 0 || a.page >= pageCount) throw new PdfError("Pagina non valida.");
    if (![a.x, a.y, a.size].every(Number.isFinite)) throw new PdfError("Posizione non valida.");
    const text = a.text.replace(/\r\n?/g, "\n").slice(0, MAX_ANNOTATION_CHARS);
    if (text.trim() === "") continue;
    out.push({
      page: a.page,
      x: clamp(a.x, 0, 1),
      y: clamp(a.y, 0, 1),
      text,
      size: clamp(a.size, MIN_SIZE, MAX_SIZE),
      color: a.color in COLORS ? a.color : "black",
      bold: !!a.bold,
    });
  }
  return out;
}

/** Applica le annotazioni a una copia del PDF e restituisce i nuovi byte. Il PDF di partenza non cambia. */
export async function stampPdf(bytes: Uint8Array, annotations: PdfAnnotation[]): Promise<Uint8Array> {
  const pdf = await load(bytes);
  const pages = pdf.getPages();
  const clean = cleanAnnotations(annotations, pages.length);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set<number>(regular.getCharacterSet());

  for (const a of clean) {
    const page = pages[a.page];
    const { width, height } = page.getSize();
    const font = a.bold ? bold : regular;
    const [r, g, b] = COLORS[a.color];
    const top = height - a.y * height;
    printable(a.text, supported)
      .split("\n")
      .forEach((line, i) => {
        if (line === "") return;
        page.drawText(line, { x: a.x * width, y: top - a.size * BASELINE - i * a.size * LINE_HEIGHT, size: a.size, font, color: rgb(r, g, b) });
      });
  }
  return pdf.save();
}
