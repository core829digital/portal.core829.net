import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { DOMParser, XMLSerializer, type Document as XmlDocument, type Element as XmlElement, type Node as XmlNode } from "@xmldom/xmldom";

// I tipi del DOM del browser (presenti nella configurazione di Convex) non coincidono con quelli di xmldom:
// in questo file "Element", "Node" e "Doc" sono SEMPRE quelli di xmldom.
type Element = XmlElement;
type Node = XmlNode;
type Doc = XmlDocument;

/**
 * Motore dei documenti DOCX (nessun accesso a database o rete: funzioni pure, testabili).
 *
 * Il DOCX originale resta il documento "vero": stili, intestazioni, immagini e tabelle non si toccano.
 * Si lavora su un elenco di paragrafi (testo), su "campi da compilare" (righe ____, [tra parentesi], caselle,
 * segnaposto {{chiave}}) e su semplici modifiche (cambio testo, elimina, aggiungi paragrafo).
 *
 * SICUREZZA: il file e' dato non fidato. Si controlla la firma ZIP, la dimensione decompressa (anti "zip bomb"),
 * la presenza di word/document.xml. Non si esegue nulla (le macro non esistono nei .docx) e i testi inseriti
 * entrano nell'XML solo come nodi di testo (mai come markup), quindi non si puo' iniettare XML.
 */

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
export const MAX_DOCX_BYTES = 15 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 80 * 1024 * 1024;
export const MAX_PARAGRAPHS = 6000;

export type DocxFiles = Record<string, Uint8Array>;

export class DocxError extends Error {}

/** Apre un DOCX controllando che sia davvero un DOCX e non troppo grande. */
export function readDocx(bytes: Uint8Array): DocxFiles {
  if (bytes.length < 100 || bytes.length > MAX_DOCX_BYTES) throw new DocxError("Il file non è un DOCX valido o supera i 15 MB.");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new DocxError("Il file non è un DOCX valido.");
  let total = 0;
  let files: DocxFiles;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        total += file.originalSize;
        if (total > MAX_UNZIPPED_BYTES) throw new DocxError("Il file è troppo grande una volta aperto.");
        return true;
      },
    });
  } catch (error) {
    if (error instanceof DocxError) throw error;
    throw new DocxError("Il file non è un DOCX valido.");
  }
  if (!files["word/document.xml"]) throw new DocxError("Il file non è un documento Word (manca word/document.xml).");
  return files;
}

function parse(files: DocxFiles, name: string): Doc {
  const raw = files[name];
  if (!raw) throw new DocxError(`Parte mancante: ${name}`);
  const doc = new DOMParser({ onError: () => undefined }).parseFromString(strFromU8(raw), "text/xml");
  if (!doc || !doc.documentElement) throw new DocxError("Documento Word non leggibile.");
  return doc;
}

function serialize(doc: Doc): Uint8Array {
  return strToU8(new XMLSerializer().serializeToString(doc));
}

export function writeDocx(files: DocxFiles): Uint8Array {
  return zipSync(files, { level: 6 });
}

const children = (el: Element, name: string): Element[] => {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (n as Element).localName === name && (n as Element).namespaceURI === W) out.push(n as Element);
  return out;
};

/** Paragrafi del documento in ordine, escludendo le copie di riserva (mc:Fallback) che duplicherebbero il testo. */
function allParagraphs(doc: Doc): Element[] {
  const list = doc.getElementsByTagNameNS(W, "p");
  const out: Element[] = [];
  for (let i = 0; i < list.length; i++) {
    const p = list.item(i) as Element;
    let skip = false;
    for (let a = p.parentNode; a; a = a.parentNode) {
      if ((a as Element).localName === "Fallback") {
        skip = true;
        break;
      }
    }
    if (!skip) out.push(p);
  }
  return out;
}

type Atom = { el: Element; start: number; text: string } | { special: string; start: number };

/** Il testo del paragrafo come sequenza di pezzi (<w:t> e simboli come tab/a-capo), con le posizioni. */
function atomsOf(p: Element): { atoms: Atom[]; text: string } {
  const atoms: Atom[] = [];
  let text = "";
  const walk = (node: Node) => {
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 1) continue;
      const e = n as Element;
      if (e.localName === "Fallback") continue;
      if (e.namespaceURI === W && e.localName === "t") {
        const t = e.textContent ?? "";
        atoms.push({ el: e, start: text.length, text: t });
        text += t;
      } else if (e.namespaceURI === W && (e.localName === "tab" || e.localName === "br" || e.localName === "cr" || e.localName === "noBreakHyphen")) {
        const ch = e.localName === "tab" ? "\t" : e.localName === "noBreakHyphen" ? "-" : "\n";
        atoms.push({ special: ch, start: text.length });
        text += ch;
      } else if (e.namespaceURI === W && (e.localName === "instrText" || e.localName === "delText")) {
        // Codici di campo e testo cancellato (revisioni): non fanno parte del testo.
      } else {
        walk(e);
      }
    }
  };
  walk(p);
  return { atoms, text };
}

export const paragraphText = (p: Element): string => atomsOf(p).text;

function setText(t: Element, value: string) {
  t.textContent = value;
  t.setAttributeNS(XML_NS, "xml:space", "preserve");
}

/** Sostituisce l'intervallo [start, end) del testo di un paragrafo, mantenendo la formattazione dei pezzi coinvolti. */
function replaceRange(p: Element, start: number, end: number, replacement: string) {
  const { atoms } = atomsOf(p);
  let placed = false;
  for (const a of atoms) {
    if ("special" in a) continue;
    const aEnd = a.start + a.text.length;
    if (aEnd <= start || a.start >= end) {
      // Un pezzo vuoto proprio nel punto di inserimento (intervallo vuoto) non conta come sovrapposto.
      if (!(start === end && a.start <= start && start <= aEnd && !placed)) continue;
    }
    const from = Math.max(0, start - a.start);
    const to = Math.min(a.text.length, end - a.start);
    const before = a.text.slice(0, from);
    const after = a.text.slice(Math.max(from, to));
    setText(a.el, placed ? before + after : before + replacement + after);
    placed = true;
  }
}

function firstRunWithText(p: Element): Element | null {
  const runs = p.getElementsByTagNameNS(W, "r");
  for (let i = 0; i < runs.length; i++) {
    const r = runs.item(i) as Element;
    if (r.getElementsByTagNameNS(W, "t").length > 0) return r;
  }
  return runs.length > 0 ? (runs.item(0) as Element) : null;
}

/** Riscrive tutto il testo di un paragrafo con una sola serie di caratteri (mantiene lo stile del paragrafo e del primo pezzo). */
function setParagraphText(doc: Doc, p: Element, text: string) {
  const source = firstRunWithText(p);
  const rPr = source ? children(source, "rPr")[0] : undefined;
  for (const child of Array.from({ length: p.childNodes.length }, (_, i) => p.childNodes.item(i) as Node)) {
    const e = child as Element;
    if (e.nodeType === 1 && e.namespaceURI === W && e.localName === "pPr") continue;
    p.removeChild(child);
  }
  const run = doc.createElementNS(W, "w:r");
  if (rPr) run.appendChild(rPr.cloneNode(true));
  const parts = text.split(/(\t|\n)/);
  for (const part of parts) {
    if (part === "\t") run.appendChild(doc.createElementNS(W, "w:tab"));
    else if (part === "\n") run.appendChild(doc.createElementNS(W, "w:br"));
    else if (part !== "") {
      const t = doc.createElementNS(W, "w:t");
      setText(t, part);
      run.appendChild(t);
    }
  }
  p.appendChild(run);
}

import { detectFields, FIELD_RE, type DocField, type DocParagraph } from "./docFields";
export { detectFields };
export type { DocField, DocParagraph };

function styleOf(p: Element): string | null {
  const pPr = children(p, "pPr")[0];
  const s = pPr ? children(pPr, "pStyle")[0] : undefined;
  return s ? (s.getAttributeNS(W, "val") ?? s.getAttribute("w:val")) : null;
}

function rowLabelOf(p: Element): string | null {
  let cell: Node | null = p.parentNode;
  while (cell && (cell as Element).localName !== "tc") cell = cell.parentNode;
  if (!cell) return null;
  const row = cell.parentNode as Element;
  const cells = children(row, "tc");
  if (cells.length < 2 || cells[0] === cell) return null;
  const first = Array.from(cells[0].getElementsByTagNameNS(W, "p"));
  return first.map((fp) => paragraphText(fp)).join(" ").trim().slice(0, 80) || null;
}

/** Elenco dei paragrafi (testo semplice) di un DOCX. */
export function listParagraphs(files: DocxFiles): DocParagraph[] {
  const doc = parse(files, "word/document.xml");
  const ps = allParagraphs(doc);
  if (ps.length > MAX_PARAGRAPHS) throw new DocxError(`Il documento ha troppi paragrafi (massimo ${MAX_PARAGRAPHS}).`);
  return ps.map((p, index) => {
    let inTable = false;
    for (let a = p.parentNode; a; a = a.parentNode) if ((a as Element).localName === "tc") inTable = true;
    return { index, text: paragraphText(p), style: styleOf(p), inTable, rowLabel: inTable ? rowLabelOf(p) : null };
  });
}

export type DocChanges = {
  /** Nuovo testo completo di un paragrafo (indice del paragrafo -> testo). */
  edits?: Record<number, string>;
  /** Paragrafi da eliminare. */
  deletes?: number[];
  /** Paragrafi da aggiungere subito dopo quello indicato. */
  inserts?: Record<number, string[]>;
  /** Valori dei campi da compilare (id del campo -> valore). Per le caselle: "true"/"false". */
  fills?: Record<string, string>;
  /** Valori dei segnaposto {{chiave}}, applicati in tutto il documento (anche intestazioni e piè di pagina). */
  vars?: Record<string, string>;
};

const MAX_TEXT = 20_000;

function clean(value: string): string {
  // Solo testo semplice: via i caratteri di controllo (tranne tab e a-capo) e i caratteri non validi in XML.
  return value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "").slice(0, MAX_TEXT);
}

function replaceVars(doc: Doc, vars: Record<string, string>): void {
  for (const p of allParagraphs(doc)) {
    const { text } = atomsOf(p);
    if (!text.includes("{{")) continue;
    const matches = [...text.matchAll(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g)].reverse();
    for (const m of matches) {
      const key = m[1];
      if (Object.prototype.hasOwnProperty.call(vars, key)) replaceRange(p, m.index ?? 0, (m.index ?? 0) + m[0].length, clean(vars[key]));
    }
  }
}

/** Applica le modifiche e restituisce un nuovo DOCX. Il file di partenza non viene modificato. */
export function applyChanges(original: DocxFiles, changes: DocChanges): DocxFiles {
  const files: DocxFiles = { ...original };
  const doc = parse(files, "word/document.xml");
  const ps = allParagraphs(doc);
  const edits = changes.edits ?? {};

  // 1. Campi compilati (sui paragrafi non riscritti per intero). Dal fondo, cosi' le posizioni restano valide.
  const byParagraph = new Map<number, { occurrence: number; value: string }[]>();
  for (const [id, value] of Object.entries(changes.fills ?? {})) {
    const m = /^p(\d+)\.(\d+)$/.exec(id);
    if (!m) throw new DocxError("Campo non valido.");
    const list = byParagraph.get(Number(m[1])) ?? [];
    list.push({ occurrence: Number(m[2]), value });
    byParagraph.set(Number(m[1]), list);
  }
  for (const [index, fills] of byParagraph) {
    const p = ps[index];
    if (!p || Object.prototype.hasOwnProperty.call(edits, index)) continue;
    const text = paragraphText(p);
    const matches = [...text.matchAll(FIELD_RE)];
    for (const fill of fills.sort((a, b) => b.occurrence - a.occurrence)) {
      const m = matches[fill.occurrence];
      if (!m) continue;
      const isBox = m[0] === "☐" || m[0] === "□";
      const value = isBox ? (fill.value === "true" ? "☒" : "☐") : clean(fill.value);
      if (!isBox && value === "") continue; // campo lasciato vuoto: resta com'e'
      replaceRange(p, m.index ?? 0, (m.index ?? 0) + m[0].length, value);
    }
  }

  // 2. Paragrafi riscritti.
  for (const [index, text] of Object.entries(edits)) {
    const p = ps[Number(index)];
    if (p) setParagraphText(doc, p, clean(text));
  }

  // 3. Paragrafi aggiunti (copiano lo stile del paragrafo di riferimento).
  for (const [index, texts] of Object.entries(changes.inserts ?? {})) {
    const ref = ps[Number(index)];
    if (!ref || !ref.parentNode) continue;
    let anchor: Node = ref;
    for (const text of texts) {
      const copy = ref.cloneNode(true) as Element;
      setParagraphText(doc, copy, clean(text));
      ref.parentNode.insertBefore(copy, anchor.nextSibling);
      anchor = copy;
    }
  }

  // 4. Paragrafi eliminati (l'ultimo paragrafo di una cella di tabella non si toglie: si svuota).
  for (const index of changes.deletes ?? []) {
    const p = ps[index];
    if (!p || !p.parentNode) continue;
    const parent = p.parentNode as Element;
    if (parent.localName === "tc" && children(parent, "p").length <= 1) setParagraphText(doc, p, "");
    else parent.removeChild(p);
  }

  // 5. Segnaposto {{chiave}} in tutto il documento, intestazioni e piè di pagina compresi.
  if (changes.vars && Object.keys(changes.vars).length > 0) {
    replaceVars(doc, changes.vars);
    for (const name of Object.keys(files)) {
      if (/^word\/(header|footer)\d*\.xml$/.test(name)) {
        const part = parse(files, name);
        replaceVars(part, changes.vars);
        files[name] = serialize(part);
      }
    }
  }

  files["word/document.xml"] = serialize(doc);
  return files;
}

// ---------------------------------------------------------------------------------------------
// Struttura per il PDF (testo + tabelle) e documento vuoto di partenza
// ---------------------------------------------------------------------------------------------

export type ModelBlock =
  | { type: "p"; text: string; style: string | null; bold: boolean; align: "left" | "center" | "right" | "both"; size: number | null; indent: number }
  | { type: "table"; rows: string[][] };

function paraBlock(p: Element): ModelBlock {
  const pPr = children(p, "pPr")[0];
  const jc = pPr ? children(pPr, "jc")[0] : undefined;
  const align = (jc?.getAttributeNS(W, "val") ?? jc?.getAttribute("w:val") ?? "left") as string;
  const ind = pPr ? children(pPr, "ind")[0] : undefined;
  const left = Number(ind?.getAttributeNS(W, "left") ?? ind?.getAttribute("w:left") ?? 0) || 0;
  const run = firstRunWithText(p);
  const rPr = run ? children(run, "rPr")[0] : undefined;
  // Grassetto = la maggior parte del testo e' in grassetto (non solo il primo pezzo).
  let boldChars = 0;
  let totalChars = 0;
  const runs = p.getElementsByTagNameNS(W, "r");
  for (let i = 0; i < runs.length; i++) {
    const r = runs.item(i) as Element;
    const len = Array.from(r.getElementsByTagNameNS(W, "t")).reduce((n, t) => n + (t.textContent ?? "").length, 0);
    if (len === 0) continue;
    const rp = children(r, "rPr")[0];
    const b = rp ? children(rp, "b")[0] : undefined;
    totalChars += len;
    if (b && (b.getAttributeNS(W, "val") ?? b.getAttribute("w:val")) !== "0") boldChars += len;
  }
  const bold = totalChars > 0 && boldChars / totalChars > 0.6;
  const sz = rPr ? children(rPr, "sz")[0] : undefined;
  const size = sz ? Number(sz.getAttributeNS(W, "val") ?? sz.getAttribute("w:val")) / 2 : null;
  return {
    type: "p",
    text: paragraphText(p),
    style: styleOf(p),
    bold,
    align: align === "center" || align === "right" || align === "both" ? align : "left",
    size: size && Number.isFinite(size) ? size : null,
    indent: Math.min(left / 20, 120),
  };
}

function tableRows(tbl: Element): string[][] {
  return children(tbl, "tr").map((tr) =>
    children(tr, "tc").map((tc) => {
      const lines: string[] = [];
      const visit = (node: Node) => {
        for (let n = node.firstChild; n; n = n.nextSibling) {
          if (n.nodeType !== 1) continue;
          const e = n as Element;
          if (e.namespaceURI !== W) continue;
          if (e.localName === "p") lines.push(paragraphText(e));
          else if (e.localName === "tbl") for (const row of tableRows(e)) lines.push(row.join("  |  "));
          else if (e.localName === "sdt") for (const c of children(e, "sdtContent")) visit(c);
        }
      };
      visit(tc);
      return lines.join("\n");
    }),
  );
}

/** Il documento come blocchi di testo e tabelle (per generare il PDF). */
export function toModel(files: DocxFiles): ModelBlock[] {
  const doc = parse(files, "word/document.xml");
  const body = doc.getElementsByTagNameNS(W, "body").item(0) as Element | null;
  const blocks: ModelBlock[] = [];
  const visit = (node: Node) => {
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 1) continue;
      const e = n as Element;
      if (e.namespaceURI !== W) continue;
      if (e.localName === "p") blocks.push(paraBlock(e));
      else if (e.localName === "tbl") blocks.push({ type: "table", rows: tableRows(e) });
      else if (e.localName === "sdt") for (const c of children(e, "sdtContent")) visit(c);
    }
  };
  if (body) visit(body);
  return blocks;
}

const escapeXml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type BlankBlock = { type: "title" | "h1" | "h2" | "p"; text: string } | { type: "table"; rows: string[][] };

/** Crea un DOCX semplice da zero (titolo, intestazioni, paragrafi, tabelle). Punto di partenza per un "documento vuoto". */
export function createBlankDocx(blocks: BlankBlock[]): Uint8Array {
  const p = (text: string, style?: string) =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${escapeXml(clean(text))}</w:t></w:r></w:p>`;
  const body = blocks
    .map((b) => {
      if (b.type === "table") {
        const rows = b.rows
          .map((r) => `<w:tr>${r.map((c) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${p(c)}</w:tc>`).join("")}</w:tr>`)
          .join("");
        return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="BBBBBB"/><w:left w:val="single" w:sz="4" w:color="BBBBBB"/><w:bottom w:val="single" w:sz="4" w:color="BBBBBB"/><w:right w:val="single" w:sz="4" w:color="BBBBBB"/><w:insideH w:val="single" w:sz="4" w:color="BBBBBB"/><w:insideV w:val="single" w:sz="4" w:color="BBBBBB"/></w:tblBorders></w:tblPr>${rows}</w:tbl>${p("")}`;
      }
      return p(b.text, b.type === "title" ? "Title" : b.type === "h1" ? "Heading1" : b.type === "h2" ? "Heading2" : undefined);
    })
    .join("");
  const ns = `xmlns:w="${W}"`;
  const style = (id: string, name: string, extra: string) =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr>${extra}</w:rPr></w:style>`;
  const files: DocxFiles = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "word/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${ns}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="288" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${style("Title", "Title", '<w:b/><w:sz w:val="40"/>')}${style("Heading1", "heading 1", '<w:b/><w:sz w:val="30"/>')}${style("Heading2", "heading 2", '<w:b/><w:sz w:val="24"/>')}</w:styles>`,
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    ),
  };
  return writeDocx(files);
}

/** Variabili che ogni documento puo' usare, con una breve descrizione (per la guida nell'editor). */
export const VARIABLE_HELP: Record<string, string> = {
  "client.name": "Nome dell'attività del cliente",
  "client.contact": "Referente",
  "client.email": "Email del cliente",
  "client.phone": "Telefono",
  "client.vat": "Partita IVA",
  "date.today": "Data di oggi (gg/mm/aaaa)",
  "company.name": "CORE829 SRL",
  "company.address": "Sede legale di CORE829",
  "company.vat": "CUI/CIF di CORE829",
};
