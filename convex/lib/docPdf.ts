import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ModelBlock } from "./docx";
import { LOGO_ASPECT, LOGO_PNG_BASE64 } from "./logoPng";

/**
 * Generatore PDF dai blocchi di un documento (testo e tabelle). Pagina A4, Helvetica (font standard).
 *
 * LIMITI NOTI (dichiarati): e' un PDF "pulito" di testo e tabelle, NON una copia identica del DOCX: immagini,
 * colori, interlinee e allineamenti particolari del Word non si riproducono. Per un PDF identico al DOCX serve un
 * convertitore esterno (vedi docs). I caratteri fuori dal set di Helvetica sono sostituiti ("[ ]" per le caselle).
 */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 84;
const MARGIN_BOTTOM = 64;
const BODY = 10;
const LEADING = 1.42;

const REPLACEMENTS: [RegExp, string][] = [
  [/[☐□]/g, "[  ]"],
  [/[☒☑✔✓]/g, "[x]"],
  [/[   ]/g, " "],
  [/[‘’‛]/g, "'"],
  [/[“”‟]/g, '"'],
  [/[‐‑‒]/g, "-"],
  [/\t/g, "    "],
  [/[\u200B-\u200D\uFEFF]/g, ""],
];

/** Rende il testo scrivibile con il font scelto: caratteri non supportati diventano "?". */
export function printable(text: string, supported: Set<number>): string {
  let s = text;
  for (const [re, to] of REPLACEMENTS) s = s.replace(re, to);
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 63;
    out += cp === 10 || supported.has(cp) ? ch : "?";
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/ +/)) {
      if (word === "") continue;
      const trial = line === "" ? word : `${line} ${word}`;
      if (font.widthOfTextAtSize(trial, size) <= width) {
        line = trial;
        continue;
      }
      if (line !== "") lines.push(line);
      // Parola piu' lunga della riga: si spezza.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

function headingLevel(style: string | null): 0 | 1 | 2 | 3 {
  if (!style) return 0;
  const s = style.toLowerCase();
  if (s === "title" || s === "titolo") return 1;
  if (/^(heading|titolo)\s*1$/.test(s)) return 1;
  if (/^(heading|titolo)\s*2$/.test(s)) return 2;
  if (/^(heading|titolo)\s*[3-9]$/.test(s)) return 3;
  return 0;
}

export async function renderPdf(blocks: ModelBlock[], opts: { title: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(opts.title.slice(0, 200));
  pdf.setProducer("CORE829 Portale");
  pdf.setCreator("CORE829 SRL");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set<number>(regular.getCharacterSet());
  const logo = await pdf.embedPng(Uint8Array.from(atob(LOGO_PNG_BASE64), (c) => c.charCodeAt(0)));

  const contentW = PAGE_W - MARGIN_X * 2;
  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN_TOP;
  };
  const ensure = (needed: number) => {
    if (y - needed < MARGIN_BOTTOM) newPage();
  };

  const drawLines = (lines: string[], font: PDFFont, size: number, x: number, width: number, align: "left" | "center" | "right" | "both") => {
    for (const line of lines) {
      ensure(size * LEADING);
      const w = font.widthOfTextAtSize(line, size);
      const dx = align === "center" ? (width - w) / 2 : align === "right" ? width - w : 0;
      if (line !== "") page.drawText(line, { x: x + Math.max(0, dx), y: y - size, size, font, color: rgb(0.1, 0.1, 0.1) });
      y -= size * LEADING;
    }
  };

  for (const block of blocks) {
    if (block.type === "p") {
      const level = headingLevel(block.style);
      const isBold = level > 0 || block.bold;
      const size = level === 1 ? 18 : level === 2 ? 13 : level === 3 ? 11 : Math.min(Math.max(block.size ?? BODY, 8), 16);
      const font = isBold ? bold : regular;
      const indent = Math.min(block.indent, contentW / 3);
      const text = printable(block.text, supported);
      if (text.trim() === "") {
        y -= BODY * 0.7;
        continue;
      }
      if (level > 0) y -= size * 0.5;
      const lines = wrap(text, font, size, contentW - indent);
      ensure(Math.min(lines.length, 3) * size * LEADING);
      drawLines(lines, font, size, MARGIN_X + indent, contentW - indent, block.align);
      y -= level > 0 ? size * 0.35 : 3;
    } else {
      const cols = Math.max(1, ...block.rows.map((r) => r.length));
      if (block.rows.length === 0) continue;
      const colW = contentW / cols;
      y -= 4;
      for (const row of block.rows) {
        const cells = Array.from({ length: cols }, (_, i) => wrap(printable(row[i] ?? "", supported), regular, 9, colW - 10));
        let remaining = cells.map((c) => c.slice());
        // Una riga piu' alta della pagina si divide in parti.
        while (remaining.some((c) => c.length > 0)) {
          const room = Math.max(1, Math.floor((y - MARGIN_BOTTOM) / (9 * LEADING)) - 1);
          if (room < 2) {
            newPage();
            continue;
          }
          const take = Math.min(room, Math.max(...remaining.map((c) => c.length)));
          const height = take * 9 * LEADING + 8;
          cells.forEach((_, i) => {
            const part = remaining[i].slice(0, take);
            const x = MARGIN_X + i * colW;
            page.drawRectangle({ x, y: y - height, width: colW, height, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.5 });
            part.forEach((line, li) => {
              if (line !== "") page.drawText(line, { x: x + 5, y: y - 4 - 9 - li * 9 * LEADING, size: 9, font: regular, color: rgb(0.1, 0.1, 0.1) });
            });
          });
          remaining = remaining.map((c) => c.slice(take));
          y -= height;
          if (remaining.some((c) => c.length > 0)) newPage();
        }
      }
      y -= 8;
    }
  }

  // Intestazione (logo + ragione sociale) e piè di pagina (numero di pagina) su ogni pagina.
  const pages = pdf.getPages();
  const logoH = 22;
  pages.forEach((pg, i) => {
    pg.drawImage(logo, { x: MARGIN_X, y: PAGE_H - 42 - logoH, width: logoH / LOGO_ASPECT, height: logoH });
    pg.drawText("CORE829 SRL", { x: PAGE_W - MARGIN_X - bold.widthOfTextAtSize("CORE829 SRL", 8), y: PAGE_H - 52, size: 8, font: bold, color: rgb(0.86, 0.1, 0.17) });
    pg.drawLine({ start: { x: MARGIN_X, y: PAGE_H - 68 }, end: { x: PAGE_W - MARGIN_X, y: PAGE_H - 68 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    const label = `Pagina ${i + 1} di ${pages.length}`;
    pg.drawText(label, { x: PAGE_W - MARGIN_X - regular.widthOfTextAtSize(label, 8), y: 34, size: 8, font: regular, color: rgb(0.45, 0.45, 0.45) });
    pg.drawText("CORE829 SRL · Str. Mihai Eminescu 10, Roman, Romania · CUI/CIF 54616345", { x: MARGIN_X, y: 34, size: 8, font: regular, color: rgb(0.45, 0.45, 0.45) });
  });

  return pdf.save();
}
