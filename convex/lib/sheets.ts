import { strFromU8, unzipSync } from "fflate";
import { DOMParser, type Element as XmlElement, type Node as XmlNode } from "@xmldom/xmldom";

/**
 * Lettore di fogli di calcolo (nessun accesso a rete o database: funzioni pure).
 * Formati: .xlsx e .xlsm (Excel), .ods (LibreOffice/OpenDocument), .csv e .tsv.
 * NON supportati (messaggio chiaro, nessuna libreria esterna con vulnerabilita' note): .xls e .xlsb vecchi -> "Salva con nome .xlsx".
 *
 * SICUREZZA: il file e' dato non fidato. Controllo firma ZIP, dimensione decompressa (anti zip-bomb), limiti di fogli,
 * righe, colonne e lunghezza delle celle. Le formule NON si calcolano e non si eseguono mai: si legge solo l'ultimo valore salvato.
 */

export const MAX_SHEET_FILE_BYTES = 5 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 60 * 1024 * 1024;
export const MAX_SHEETS = 20;
export const MAX_ROWS = 2000;
export const MAX_COLS = 50;
export const MAX_CELL_CHARS = 500;

export class SheetError extends Error {}

export type Sheet = { name: string; rows: string[][]; truncated: boolean };

type Xml = XmlElement;
const parseXml = (text: string): Xml => {
  const doc = new DOMParser({ onError: () => undefined }).parseFromString(text, "text/xml");
  if (!doc || !doc.documentElement) throw new SheetError("Il file non è leggibile.");
  return doc.documentElement as Xml;
};
const kids = (el: Xml, name: string): Xml[] => {
  const out: Xml[] = [];
  for (let n: XmlNode | null = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (n as Xml).localName === name) out.push(n as Xml);
  return out;
};
const first = (el: Xml, name: string): Xml | null => kids(el, name)[0] ?? null;
const textOf = (el: XmlNode | null): string => (el ? (el.textContent ?? "") : "");
const clip = (s: string): string => (s.length > MAX_CELL_CHARS ? `${s.slice(0, MAX_CELL_CHARS - 1)}…` : s);

function unzip(bytes: Uint8Array): Record<string, Uint8Array> {
  let total = 0;
  try {
    return unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_UNZIPPED_BYTES) throw new SheetError("Il file è troppo grande una volta aperto.");
        return true;
      },
    });
  } catch (error) {
    if (error instanceof SheetError) throw error;
    throw new SheetError("Il file non è un foglio di calcolo valido.");
  }
}

/** "B3" -> { col: 1, row: 2 } */
function ref(a: string): { col: number; row: number } | null {
  const m = /^([A-Za-z]{1,3})(\d{1,7})$/.exec(a);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(m[2]) - 1 };
}

const BUILTIN_DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const BUILTIN_PERCENT = new Set([9, 10]);

function isDateFormat(code: string): boolean {
  const c = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  return /[dmyhs]/i.test(c) && !/^(general|0|#)/i.test(c.trim());
}

function two(n: number): string {
  return String(n).padStart(2, "0");
}

function serialToText(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(serial);
  const date = `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  const frac = serial - Math.floor(serial);
  return frac > 0.00001 ? `${date} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}` : date;
}

function numberText(raw: string, percent: boolean): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  const v = percent ? n * 100 : n;
  const rounded = Math.round(v * 1e6) / 1e6; // toglie il rumore dei decimali (0.1+0.2)
  return `${rounded.toLocaleString("it-IT", { maximumFractionDigits: 6, useGrouping: false })}${percent ? "%" : ""}`;
}

function readXlsx(files: Record<string, Uint8Array>): Sheet[] {
  const wbRaw = files["xl/workbook.xml"];
  if (!wbRaw) throw new SheetError("Il file non è un foglio Excel valido (manca xl/workbook.xml).");
  const wb = parseXml(strFromU8(wbRaw));
  const relsRaw = files["xl/_rels/workbook.xml.rels"];
  const rels = new Map<string, string>();
  if (relsRaw) for (const r of kids(parseXml(strFromU8(relsRaw)), "Relationship")) rels.set(r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? "");

  const shared: string[] = [];
  if (files["xl/sharedStrings.xml"]) for (const si of kids(parseXml(strFromU8(files["xl/sharedStrings.xml"])), "si")) shared.push(textOf(si));

  // Formati delle celle: quali sono date o percentuali.
  const styleKind: ("date" | "percent" | "plain")[] = [];
  if (files["xl/styles.xml"]) {
    const styles = parseXml(strFromU8(files["xl/styles.xml"]));
    const custom = new Map<number, string>();
    const numFmts = first(styles, "numFmts");
    if (numFmts) for (const f of kids(numFmts, "numFmt")) custom.set(Number(f.getAttribute("numFmtId")), f.getAttribute("formatCode") ?? "");
    const xfs = first(styles, "cellXfs");
    if (xfs) {
      for (const xf of kids(xfs, "xf")) {
        const id = Number(xf.getAttribute("numFmtId") ?? 0);
        if (BUILTIN_PERCENT.has(id)) styleKind.push("percent");
        else if (BUILTIN_DATE_IDS.has(id) || (custom.has(id) && isDateFormat(custom.get(id) ?? ""))) styleKind.push("date");
        else if (custom.has(id) && /%/.test(custom.get(id) ?? "")) styleKind.push("percent");
        else styleKind.push("plain");
      }
    }
  }
  const date1904 = first(wb, "workbookPr")?.getAttribute("date1904") === "1";

  const sheetsEl = first(wb, "sheets");
  const out: Sheet[] = [];
  for (const s of sheetsEl ? kids(sheetsEl, "sheet").slice(0, MAX_SHEETS) : []) {
    const rid = s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? s.getAttribute("r:id") ?? "";
    let target = rels.get(rid) ?? "";
    target = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    const raw = files[target];
    if (!raw || s.getAttribute("state") === "hidden") continue;
    const data = first(parseXml(strFromU8(raw)), "sheetData");
    const rows: string[][] = [];
    let truncated = false;
    let nextRow = 0;
    for (const r of data ? kids(data, "row") : []) {
      const rowIndex = r.getAttribute("r") ? Number(r.getAttribute("r")) - 1 : nextRow;
      nextRow = rowIndex + 1;
      if (rowIndex >= MAX_ROWS) {
        truncated = true;
        break;
      }
      let nextCol = 0;
      for (const c of kids(r, "c")) {
        const pos = c.getAttribute("r") ? ref(c.getAttribute("r") ?? "") : null;
        const col = pos ? pos.col : nextCol;
        nextCol = col + 1;
        if (col >= MAX_COLS) {
          truncated = true;
          continue;
        }
        const type = c.getAttribute("t") ?? "n";
        const v = textOf(first(c, "v"));
        let value = "";
        if (type === "s") value = shared[Number(v)] ?? "";
        else if (type === "inlineStr") value = textOf(first(c, "is"));
        else if (type === "b") value = v === "1" ? "Sì" : "No";
        else if (type === "str" || type === "e") value = v;
        else if (v !== "") {
          const kind = styleKind[Number(c.getAttribute("s") ?? 0)] ?? "plain";
          value = kind === "date" ? serialToText(Number(v) + (date1904 ? 1462 : 0)) : numberText(v, kind === "percent");
        }
        if (value === "") continue;
        while (rows.length <= rowIndex) rows.push([]);
        const line = rows[rowIndex];
        while (line.length <= col) line.push("");
        line[col] = clip(value);
      }
    }
    out.push({ name: clip(s.getAttribute("name") ?? `Foglio ${out.length + 1}`), rows: normalize(rows), truncated });
  }
  return out;
}

function readOds(files: Record<string, Uint8Array>): Sheet[] {
  const raw = files["content.xml"];
  if (!raw) throw new SheetError("Il file non è un foglio OpenDocument valido.");
  const root = parseXml(strFromU8(raw));
  const body = first(root, "body");
  const spreadsheet = body ? first(body, "spreadsheet") : null;
  const out: Sheet[] = [];
  for (const t of spreadsheet ? kids(spreadsheet, "table").slice(0, MAX_SHEETS) : []) {
    const rows: string[][] = [];
    let truncated = false;
    const rowEls = kids(t, "table-row").concat(...kids(t, "table-row-group").map((g) => kids(g, "table-row")));
    for (const r of rowEls) {
      const repeatRow = Math.min(Number(r.getAttribute("table:number-rows-repeated") ?? 1), 1);
      const line: string[] = [];
      for (const c of kids(r, "table-cell")) {
        const repeat = Math.min(Number(c.getAttribute("table:number-columns-repeated") ?? 1), MAX_COLS);
        const type = c.getAttribute("office:value-type");
        let value = "";
        if (type === "float" || type === "currency") value = numberText(c.getAttribute("office:value") ?? "", false);
        else if (type === "percentage") value = numberText(c.getAttribute("office:value") ?? "", true);
        else if (type === "date") {
          const d = c.getAttribute("office:date-value") ?? "";
          const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
          value = m ? `${m[3]}/${m[2]}/${m[1]}` : d;
        } else if (type === "boolean") value = c.getAttribute("office:boolean-value") === "true" ? "Sì" : "No";
        else value = kids(c, "p").map((p) => textOf(p)).join("\n");
        for (let i = 0; i < repeat && line.length < MAX_COLS; i++) line.push(value === "" ? "" : clip(value));
      }
      for (let i = 0; i < repeatRow; i++) {
        if (rows.length >= MAX_ROWS) {
          truncated = true;
          break;
        }
        rows.push(line);
      }
      if (truncated) break;
    }
    out.push({ name: clip(t.getAttribute("table:name") ?? `Foglio ${out.length + 1}`), rows: normalize(rows), truncated });
  }
  return out;
}

/** CSV/TSV: virgolette, separatore , ; o tab riconosciuto dalla prima riga. */
export function parseCsv(text: string): Sheet {
  const src = text.replace(/^﻿/, "");
  const head = src.split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => head.split(ch).length - 1;
  const sep = count("\t") >= Math.max(count(";"), count(",")) && count("\t") > 0 ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let truncated = false;
  const endRow = () => {
    row.push(clip(cell));
    cell = "";
    if (row.some((c) => c !== "")) rows.push(row.slice(0, MAX_COLS));
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(clip(cell));
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      endRow();
      if (rows.length >= MAX_ROWS) {
        truncated = true;
        break;
      }
    } else cell += ch;
  }
  if (!truncated && (cell !== "" || row.length > 0)) endRow();
  return { name: "Dati", rows: normalize(rows), truncated };
}

/** Righe tutte della stessa larghezza, senza righe e colonne vuote in fondo. */
function normalize(rows: string[][]): string[][] {
  let width = 0;
  const lines = rows.map((r) => {
    let end = r.length;
    while (end > 0 && r[end - 1] === "") end--;
    width = Math.max(width, end);
    return r.slice(0, end);
  });
  while (lines.length > 0 && lines[lines.length - 1].length === 0) lines.pop();
  return lines.map((r) => [...r, ...Array<string>(width - r.length).fill("")]);
}

/** Legge un foglio di calcolo dal nome del file e dai byte. */
export function readSheets(bytes: Uint8Array, fileName: string): Sheet[] {
  if (bytes.length === 0 || bytes.length > MAX_SHEET_FILE_BYTES) throw new SheetError("Il file è vuoto o supera i 5 MB.");
  const ext = /\.([A-Za-z0-9]+)$/.exec(fileName)?.[1]?.toLowerCase() ?? "";
  if (ext === "csv" || ext === "tsv" || ext === "txt") {
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) throw new SheetError("Il file sembra un Excel, non un CSV: controlla l'estensione.");
    return [parseCsv(new TextDecoder("utf-8").decode(bytes))];
  }
  if (ext === "xls" || ext === "xlsb" || (bytes[0] === 0xd0 && bytes[1] === 0xcf)) {
    throw new SheetError("I vecchi formati .xls e .xlsb non sono supportati: in Excel scegli «Salva con nome» e seleziona «Cartella di lavoro di Excel (.xlsx)» oppure CSV.");
  }
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new SheetError("Il file non è un foglio di calcolo valido (usa .xlsx, .ods o .csv).");
  const files = unzip(bytes);
  const sheets = ext === "ods" || files["content.xml"] ? readOds(files) : readXlsx(files);
  if (sheets.length === 0) throw new SheetError("Il file non contiene fogli leggibili.");
  return sheets;
}
