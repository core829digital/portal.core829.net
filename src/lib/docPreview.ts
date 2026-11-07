import { FIELD_RE, type DocField, type DocParagraph } from "../../convex/lib/docFields";

export type PreviewSegment =
  | { type: "text"; text: string }
  | { type: "field"; fieldId: string; fieldKind: DocField["kind"]; text: string; filled: boolean };

export type PreviewBlock = {
  /** Indice del paragrafo originale; null per i paragrafi aggiunti. */
  index: number | null;
  /** Posizione tra i paragrafi aggiunti dopo `index`. */
  insertedAfter: number | null;
  style: string | null;
  inTable: boolean;
  rowLabel: string | null;
  edited: boolean;
  segments: PreviewSegment[];
  /** Tabella aggiunta (da Excel): in questo caso `segments` e' vuoto. */
  table?: { rows: string[][]; header: boolean };
};

export type PreviewTable = { after: number; header: boolean; rows: string[][] };

export type PreviewState = {
  edits: Record<number, string>;
  deletes: ReadonlySet<number>;
  inserts: Record<number, string[]>;
  fills: Record<string, string>;
  tables?: PreviewTable[];
};

/**
 * Il documento come apparira' dopo il salvataggio, calcolato subito nel browser (nessuna chiamata al server):
 * stesse regole del server (paragrafo riscritto = i campi non si applicano; campo vuoto resta visibile come campo).
 */
export function composePreview(paragraphs: DocParagraph[], fields: DocField[], state: PreviewState): PreviewBlock[] {
  const byParagraph = new Map<number, DocField[]>();
  for (const f of fields) byParagraph.set(f.paragraph, [...(byParagraph.get(f.paragraph) ?? []), f]);
  const out: PreviewBlock[] = [];
  for (const p of paragraphs) {
    if (!state.deletes.has(p.index)) {
      const rewritten = Object.prototype.hasOwnProperty.call(state.edits, p.index);
      out.push({
        index: p.index,
        insertedAfter: null,
        style: p.style,
        inTable: p.inTable,
        rowLabel: p.rowLabel,
        edited: rewritten,
        segments: rewritten ? textSegments(state.edits[p.index]) : fieldSegments(p, byParagraph.get(p.index) ?? [], state.fills),
      });
    }
    for (const t of (state.tables ?? []).filter((x) => x.after === p.index)) {
      out.push({ index: null, insertedAfter: p.index, style: null, inTable: false, rowLabel: null, edited: true, segments: [], table: { rows: t.rows, header: t.header } });
    }
    for (const text of state.inserts[p.index] ?? []) {
      if (text.trim() === "") continue;
      out.push({ index: null, insertedAfter: p.index, style: null, inTable: false, rowLabel: null, edited: true, segments: textSegments(text) });
    }
  }
  return out;
}

function textSegments(text: string): PreviewSegment[] {
  return text === "" ? [] : [{ type: "text", text }];
}

function fieldSegments(p: DocParagraph, fields: DocField[], fills: Record<string, string>): PreviewSegment[] {
  if (fields.length === 0) return textSegments(p.text);
  const segs: PreviewSegment[] = [];
  const push = (f: DocField, token: string) => {
    const raw = fills[f.id] ?? "";
    if (f.kind === "checkbox") segs.push({ type: "field", fieldId: f.id, fieldKind: f.kind, text: raw === "true" ? "☒" : "☐", filled: raw === "true" });
    else segs.push({ type: "field", fieldId: f.id, fieldKind: f.kind, text: raw !== "" ? raw : token === "" ? "—" : token, filled: raw !== "" });
  };
  // Cella vuota di un modulo: un solo campo senza testo.
  if (p.text.trim() === "" && fields.length === 1 && fields[0].token === "") {
    push(fields[0], "");
    return segs;
  }
  let last = 0;
  let k = 0;
  for (const m of p.text.matchAll(FIELD_RE)) {
    const at = m.index ?? 0;
    if (at > last) segs.push({ type: "text", text: p.text.slice(last, at) });
    const f = fields[k++];
    if (f) push(f, m[0]);
    else segs.push({ type: "text", text: m[0] });
    last = at + m[0].length;
  }
  if (last < p.text.length) segs.push({ type: "text", text: p.text.slice(last) });
  return segs;
}

/** Quanti campi sono ancora da compilare (utile per il riepilogo e per impedire invii incompleti per errore). */
export function remainingFields(fields: DocField[], state: PreviewState): DocField[] {
  return fields.filter(
    (f) => f.kind !== "checkbox" && !state.deletes.has(f.paragraph) && !Object.prototype.hasOwnProperty.call(state.edits, f.paragraph) && (state.fills[f.id] ?? "") === "",
  );
}
