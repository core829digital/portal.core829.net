import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildVariables, type ClientData } from "./autofill";
import { autofillPdf, fieldNameToLabel, variableForFieldName } from "./pdfAutofill";
import { inspectPdf, stampPdf } from "./pdfStamp";

const client: ClientData = {
  displayName: "Acme Srl", contactName: "Mario Rossi", email: "mario@acme.it", phone: null,
  vatId: "IT01234567890", address: "Via Roma 1, Milano", pec: "acme@pec.it", legalRep: null, website: null,
};
const vars = buildVariables(client, { now: Date.UTC(2026, 10, 7, 12), number: "CTR-2026-001" });

async function formPdf(): Promise<{ bytes: Uint8Array; rects: Record<string, { x: number; y: number; w: number; h: number; page: number }> }> {
  const pdf = await PDFDocument.create();
  const p1 = pdf.addPage([600, 800]);
  const p2 = pdf.addPage([600, 800]);
  const form = pdf.getForm();
  const rects: Record<string, { x: number; y: number; w: number; h: number; page: number }> = {};
  const add = (name: string, page: typeof p1, idx: number, x: number, y: number) => {
    const f = form.createTextField(name);
    f.addToPage(page, { x, y, width: 200, height: 18 });
    rects[name] = { x, y, w: 200, h: 18, page: idx };
  };
  add("Partita_IVA", p1, 0, 100, 700);
  add("pec", p1, 0, 100, 650);
  add("Forma_giuridica", p1, 0, 100, 600);
  add("client.address", p2, 1, 50, 300);
  add("telefono", p2, 1, 50, 250); // dato mancante
  return { bytes: await pdf.save(), rects };
}

describe("nomi dei campi", () => {
  it("li trasforma in etichette", () => {
    expect(fieldNameToLabel("Partita_IVA")).toBe("Partita IVA");
    expect(fieldNameToLabel("ragioneSociale")).toBe("ragione Sociale");
    expect(variableForFieldName("Partita_IVA")).toBe("client.vat");
    expect(variableForFieldName("client.pec")).toBe("client.pec");
    expect(variableForFieldName("company_name")).toBe("company.name");
    expect(variableForFieldName("Forma_giuridica")).toBeNull();
  });
});

describe("autofillPdf", () => {
  it("mette i testi dentro i campi giusti, anche sulla seconda pagina", async () => {
    const { bytes, rects } = await formPdf();
    const { annotations, filled } = await autofillPdf(bytes, vars);
    expect(filled.map((f) => f.value).sort()).toEqual(["IT01234567890", "Via Roma 1, Milano", "acme@pec.it"].sort());
    const byText = (t: string) => annotations.find((a) => a.text === t)!;
    for (const [text, name] of [["IT01234567890", "Partita_IVA"], ["acme@pec.it", "pec"], ["Via Roma 1, Milano", "client.address"]] as const) {
      const a = byText(text);
      const r = rects[name];
      expect(a.page).toBe(r.page);
      expect(a.x * 600).toBeGreaterThanOrEqual(r.x);
      expect(a.x * 600).toBeLessThan(r.x + r.w);
      const topPdf = 800 - a.y * 800; // bordo alto del testo
      expect(topPdf).toBeLessThanOrEqual(r.y + r.h + 1);
      expect(topPdf).toBeGreaterThanOrEqual(r.y);
    }
  });
  it("il PDF con i testi sovrapposti e' valido", async () => {
    const { bytes } = await formPdf();
    const { annotations } = await autofillPdf(bytes, vars);
    const out = await stampPdf(bytes, annotations);
    expect((await inspectPdf(out)).pages).toHaveLength(2);
  });
  it("non tocca i campi gia' compilati e non fallisce su PDF senza moduli o rovinati", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.getForm().createTextField("pec").setText("gia@pec.it");
    pdf.getPages()[0].drawText("x");
    pdf.getForm().getTextField("pec").addToPage(pdf.getPages()[0], { x: 10, y: 10, width: 100, height: 20 });
    expect((await autofillPdf(await pdf.save(), vars)).annotations).toEqual([]);
    const plain = await PDFDocument.create();
    plain.addPage();
    expect((await autofillPdf(await plain.save(), vars)).annotations).toEqual([]);
    expect((await autofillPdf(new Uint8Array([1, 2, 3]), vars)).annotations).toEqual([]);
  });
});
