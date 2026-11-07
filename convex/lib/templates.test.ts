import { describe, expect, it } from "vitest";
import { autofillFields, buildVariables, type ClientData } from "./autofill";
import { applyChanges, createBlankDocx, detectFields, listParagraphs, readDocx, toModel } from "./docx";
import { renderPdf } from "./docPdf";
import { BUILTIN_TEMPLATES } from "./templates";
import { PDFDocument } from "pdf-lib";

const client: ClientData = {
  displayName: "Acme Srl", contactName: "Mario Rossi", email: "mario@acme.it", phone: "+39 333 1234567",
  vatId: "IT01234567890", address: "Via Roma 1, Milano", pec: "acme@pec.it", legalRep: "Mario Rossi, Amministratore", website: "https://acme.it",
};
const vars = buildVariables(client, { now: Date.UTC(2026, 10, 7, 12), number: "PRV-2026-001" });

describe("modelli CORE829 inclusi", () => {
  it("hanno chiavi uniche, nomi e descrizioni", () => {
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.key)).size).toBe(BUILTIN_TEMPLATES.length);
    expect(BUILTIN_TEMPLATES.map((t) => t.key)).toEqual(["preventivo", "modulo-ordine", "dpa-gdpr", "nda", "liberatoria-immagini", "verbale-accettazione"]);
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(5);
      expect(t.description).toMatch(/[Rr]evisione/);
    }
  });

  it.each(BUILTIN_TEMPLATES.map((t) => [t.key, t] as const))("%s: e' un DOCX valido, si compila con i dati e diventa un PDF", async (_key, t) => {
    const files = readDocx(createBlankDocx(t.blocks));
    const fields = detectFields(listParagraphs(files));
    expect(fields.length).toBeGreaterThan(3);
    const { fills } = autofillFields(fields, vars);
    const out = applyChanges(files, { vars, fills });
    const text = listParagraphs(out).map((p) => p.text).join("\n");
    // Con tutti i dati disponibili non resta nessun segnaposto {{...}}.
    expect(text).not.toMatch(/\{\{/);
    expect(text).toContain("CORE829 SRL");
    if (t.key !== "liberatoria-immagini") expect(text).toContain("Acme Srl");
    // Resta sempre qualcosa da completare a mano (importi, firme, scelte).
    expect(detectFields(listParagraphs(out)).length).toBeGreaterThan(0);
    const pdf = await PDFDocument.load(await renderPdf(toModel(out), { title: t.name }));
    expect(pdf.getPageCount()).toBeGreaterThan(0);
  });

  it("senza dati del cliente i segnaposto restano visibili (da compilare), mai righe vuote o dati inventati", () => {
    const sparse = buildVariables({ ...client, address: null, vatId: null, pec: null, legalRep: null, phone: null, website: null }, { now: Date.UTC(2026, 10, 7), number: "X" });
    const t = BUILTIN_TEMPLATES[0];
    const files = readDocx(createBlankDocx(t.blocks));
    const out = applyChanges(files, { vars: sparse });
    const text = listParagraphs(out).map((p) => p.text).join("\n");
    expect(text).toContain("{{client.pec}}");
    expect(text).toContain("{{client.vat}}");
    expect(text).not.toContain("undefined");
  });

  it("la liberatoria non copia i dati del cliente nei campi del soggetto ripreso", () => {
    const t = BUILTIN_TEMPLATES.find((x) => x.key === "liberatoria-immagini")!;
    const files = readDocx(createBlankDocx(t.blocks));
    const { filled } = autofillFields(detectFields(listParagraphs(files)), vars);
    expect(filled).toEqual([]);
    const out = applyChanges(files, { vars });
    const text = listParagraphs(out).map((p) => p.text).join("\n");
    expect(text).not.toContain("mario@acme.it");
    expect(text).not.toContain("Via Roma 1");
  });

  it("i riferimenti di legge principali sono presenti", () => {
    const all = (k: string) => BUILTIN_TEMPLATES.find((t) => t.key === k)!.blocks.map((b) => (b.type === "table" ? b.rows.flat().join(" ") : b.text)).join(" ");
    expect(all("preventivo")).toMatch(/2006\/112\/CE/);
    expect(all("dpa-gdpr")).toMatch(/art\. 28/i);
    expect(all("dpa-gdpr")).toMatch(/art\. 32/);
    expect(all("dpa-gdpr")).toMatch(/art\. 33/);
    expect(all("liberatoria-immagini")).toMatch(/633\/1941/);
    expect(all("liberatoria-immagini")).toMatch(/art\. 13/);
  });
});
