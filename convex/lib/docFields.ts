/**
 * Campi da compilare di un documento: righe vuote, testo [tra parentesi], caselle ☐ e segnaposto {{chiave}}.
 * Modulo senza dipendenze: lo usano sia il server (motore DOCX) sia il browser (editor), senza portare nel
 * browser le librerie per leggere i file.
 */

export type DocParagraph = {
  index: number;
  text: string;
  style: string | null;
  inTable: boolean;
  /** Per i paragrafi in tabella: il testo della prima cella della riga (la "etichetta" del campo). */
  rowLabel: string | null;
};

export type DocField = {
  id: string;
  paragraph: number;
  occurrence: number;
  kind: "blank" | "checkbox" | "variable";
  token: string;
  /** Nome del segnaposto per i campi `variable` (es. "client.name"). */
  key: string | null;
  label: string;
  context: string;
};

export const FIELD_RE = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}|_{3,}|\[[^\]\n]{1,120}\]|[☐□]/g;


/** Trova i campi da compilare nei paragrafi: righe vuote, testo [tra parentesi], caselle ☐, segnaposto {{chiave}}. */
export function detectFields(paragraphs: DocParagraph[]): DocField[] {
  const out: DocField[] = [];
  for (const para of paragraphs) {
    let occurrence = 0;
    for (const m of para.text.matchAll(FIELD_RE)) {
      const token = m[0];
      const at = m.index ?? 0;
      const kind: DocField["kind"] = m[1] ? "variable" : token === "☐" || token === "□" ? "checkbox" : "blank";
      const before = para.text.slice(Math.max(0, at - 70), at).replace(/\s+/g, " ").trim();
      const after = para.text.slice(at + token.length, at + token.length + 60).replace(/\s+/g, " ").trim();
      const label = kind === "checkbox" ? after || "Casella" : para.rowLabel ? para.rowLabel : before || after || token;
      out.push({
        id: `p${para.index}.${occurrence++}`,
        paragraph: para.index,
        occurrence: occurrence - 1,
        kind,
        token,
        key: m[1] ?? null,
        label: label.slice(0, 120),
        context: para.text.replace(/\s+/g, " ").slice(0, 220),
      });
    }
  }
  return out;
}

