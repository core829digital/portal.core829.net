import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { COMPANY } from "./autofill";
import { LOGO_ASPECT, LOGO_PNG_BASE64, LOGO_SERVER_ASPECT, LOGO_SERVER_PNG_BASE64 } from "./logoPng";

/**
 * Marchio di CORE829 sui documenti: due loghi in intestazione (CORE829 + Servers) e blocco firma/timbro.
 * Firma e timbro NON stanno nel codice (repository pubblico): arrivano dall'archivio privato (convex/brand.ts) come byte PNG.
 * Funzioni pure: nessun accesso a database o rete.
 */

export type Brand = { signature?: Uint8Array; stamp?: Uint8Array };

export const MAX_BRAND_PNG_BYTES = 2 * 1024 * 1024;
export const MAX_BRAND_PX = 4000;

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const coreLogoBytes = () => fromBase64(LOGO_PNG_BASE64);
export const serverLogoBytes = () => fromBase64(LOGO_SERVER_PNG_BASE64);
export { LOGO_ASPECT, LOGO_SERVER_ASPECT };

/** Dimensioni di un PNG se e' davvero un PNG valido (firma + blocco IHDR), altrimenti null. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 33 || sig.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(12) !== 0x49484452) return null; // "IHDR"
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

export type Logos = { core: PDFImage; server: PDFImage };
export type Seal = { signature?: PDFImage; stamp?: PDFImage };

export async function embedLogos(pdf: PDFDocument): Promise<Logos> {
  return { core: await pdf.embedPng(coreLogoBytes()), server: await pdf.embedPng(serverLogoBytes()) };
}

export async function embedSeal(pdf: PDFDocument, brand: Brand | undefined): Promise<Seal> {
  return {
    signature: brand?.signature ? await pdf.embedPng(brand.signature) : undefined,
    stamp: brand?.stamp ? await pdf.embedPng(brand.stamp) : undefined,
  };
}

export const hasSeal = (b: Brand | undefined): boolean => Boolean(b?.signature || b?.stamp);

const LOGO_H = 24;

/** Intestazione: logo CORE829 + logo Servers a sinistra, ragione sociale a destra, filetto sotto. */
export function drawLetterhead(page: PDFPage, logos: Logos, bold: PDFFont, marginX: number): void {
  const { width, height } = page.getSize();
  const coreW = LOGO_H / LOGO_ASPECT;
  page.drawImage(logos.core, { x: marginX, y: height - 42 - LOGO_H, width: coreW, height: LOGO_H });
  const sepX = marginX + coreW + 10;
  page.drawLine({ start: { x: sepX, y: height - 44 }, end: { x: sepX, y: height - 42 - LOGO_H + 2 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  page.drawImage(logos.server, { x: sepX + 10, y: height - 42 - LOGO_H, width: LOGO_H / LOGO_SERVER_ASPECT, height: LOGO_H });
  const name = COMPANY.name;
  page.drawText(name, { x: width - marginX - bold.widthOfTextAtSize(name, 8), y: height - 52, size: 8, font: bold, color: rgb(0.86, 0.1, 0.17) });
  page.drawLine({ start: { x: marginX, y: height - 68 }, end: { x: width - marginX, y: height - 68 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
}

export const SEAL_HEIGHT = 130;

/** Blocco firma e timbro: etichetta, timbro e firma sovrapposta (come su carta). Occupa SEAL_HEIGHT sotto `yTop`. */
export function drawSeal(page: PDFPage, seal: Seal, fonts: { regular: PDFFont; bold: PDFFont }, x: number, yTop: number): void {
  page.drawText(`Per ${COMPANY.name}`, { x, y: yTop - 10, size: 9, font: fonts.bold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`${COMPANY.rep} — ${COMPANY.repRole}`, { x, y: yTop - 22, size: 8.5, font: fonts.regular, color: rgb(0.3, 0.3, 0.3) });
  const baseY = yTop - SEAL_HEIGHT + 4;
  let stampW = 0;
  if (seal.stamp) {
    stampW = 88;
    const h = stampW * (seal.stamp.height / seal.stamp.width);
    page.drawImage(seal.stamp, { x: x + 60, y: baseY, width: stampW, height: h, opacity: 0.92 });
  }
  if (seal.signature) {
    const w = 130;
    const h = w * (seal.signature.height / seal.signature.width);
    page.drawImage(seal.signature, { x: x + (seal.stamp ? 30 : 0), y: baseY + (seal.stamp ? 22 : 8), width: w, height: h });
  }
}

/**
 * PDF caricato: non si tocca nessuna pagina esistente. In fondo si aggiunge una pagina "Firma e timbro" con i due loghi
 * (cosi' il timbro non copre mai il testo del documento). Senza firma e timbro il file resta identico.
 */
export async function sealPdf(bytes: Uint8Array, brand: Brand | undefined): Promise<Uint8Array> {
  if (!hasSeal(brand)) return bytes;
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const last = pdf.getPages()[pdf.getPageCount() - 1];
  const { width, height } = last ? last.getSize() : { width: 595.28, height: 841.89 };
  const page = pdf.addPage([width, height]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logos = await embedLogos(pdf);
  const seal = await embedSeal(pdf, brand);
  drawLetterhead(page, logos, bold, 56);
  page.drawText("Firma e timbro", { x: 56, y: height - 110, size: 14, font: bold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText("Pagina aggiunta in coda al documento ricevuto.", { x: 56, y: height - 128, size: 9, font: regular, color: rgb(0.4, 0.4, 0.4) });
  drawSeal(page, seal, { regular, bold }, 56, height - 160);
  return pdf.save();
}
