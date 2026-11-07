import { describe, expect, it } from "vitest";
import { detectFields, type DocParagraph } from "../../convex/lib/docFields";
import { composePreview, remainingFields } from "./docPreview";

const para = (index: number, text: string, extra: Partial<DocParagraph> = {}): DocParagraph => ({ index, text, style: null, inTable: false, rowLabel: null, ...extra });
const empty = { edits: {}, deletes: new Set<number>(), inserts: {}, fills: {} };
const flat = (b: ReturnType<typeof composePreview>) => b.map((x) => x.segments.map((s) => s.text).join(""));

describe("anteprima live", () => {
  const ps = [para(0, "Contratto"), para(1, "Firma: ______ data [GG/MM] ☐ ok"), para(2, "Cliente", { inTable: true, rowLabel: "Cliente" }), para(3, "", { inTable: true, rowLabel: "PEC" })];
  const fields = detectFields(ps);

  it("senza modifiche mostra il testo originale con i campi ancora vuoti", () => {
    const b = composePreview(ps, fields, empty);
    expect(flat(b)).toEqual(["Contratto", "Firma: ______ data [GG/MM] ☐ ok", "Cliente", "—"]);
    expect(b[1].segments.filter((s) => s.type === "field" && !s.filled)).toHaveLength(3);
  });
  it("applica subito i valori, le caselle e le celle vuote", () => {
    const b = composePreview(ps, fields, { ...empty, fills: { "p1.0": "Mario", "p1.1": "07/11", "p1.2": "true", "p3.0": "a@pec.it" } });
    expect(flat(b)).toEqual(["Contratto", "Firma: Mario data 07/11 ☒ ok", "Cliente", "a@pec.it"]);
  });
  it("paragrafo riscritto: vale il testo nuovo e i campi non si applicano; eliminati spariscono; aggiunti compaiono", () => {
    const b = composePreview(ps, fields, { edits: { 1: "Testo nuovo" }, deletes: new Set([0]), inserts: { 2: ["Aggiunto", "  "] }, fills: { "p1.0": "X" } });
    expect(flat(b)).toEqual(["Testo nuovo", "Cliente", "Aggiunto", "—"]);
    expect(b[2]).toMatchObject({ index: null, insertedAfter: 2 });
  });
  it("conta i campi ancora da compilare (caselle escluse, paragrafi riscritti/eliminati esclusi)", () => {
    expect(remainingFields(fields, empty)).toHaveLength(3);
    expect(remainingFields(fields, { ...empty, fills: { "p1.0": "x" }, deletes: new Set([3]) })).toHaveLength(1);
    expect(remainingFields(fields, { ...empty, edits: { 1: "x" } })).toHaveLength(1);
  });
  it("mostra le tabelle aggiunte subito dopo il paragrafo scelto", () => {
    const b = composePreview(ps, fields, { ...empty, tables: [{ after: 0, header: true, rows: [["A", "B"], ["1", "2"]] }] });
    expect(b[1].table).toEqual({ header: true, rows: [["A", "B"], ["1", "2"]] });
    expect(b[0].index).toBe(0);
    expect(b).toHaveLength(5);
  });
});
