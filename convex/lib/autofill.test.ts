import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  autofillFields,
  buildVariables,
  COMPANY,
  documentNumber,
  formatDateRome,
  variableForLabel,
  type ClientData,
} from "./autofill";
import { applyChanges, createBlankDocx, detectFields, listParagraphs, readDocx } from "./docx";

const client: ClientData = {
  displayName: "Acme Srl",
  contactName: "Mario Rossi",
  email: "mario@acme.it",
  phone: "+39 333 1234567",
  vatId: "IT01234567890",
  address: "Via Roma 1, Milano",
  pec: "acme@pec.it",
  legalRep: "Mario Rossi, Amministratore",
  website: "https://acme.it",
};
const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);

describe("numerazione e date", () => {
  it("numera per categoria e anno", () => {
    expect(documentNumber("contract", 2026, 0)).toBe("CTR-2026-001");
    expect(documentNumber("quote", 2026, 13)).toBe("PRV-2026-014");
    expect(documentNumber("legal", 2026, 999)).toBe("LEG-2026-1000");
    expect(documentNumber("other", 2027, 4)).toBe("DOC-2027-005");
  });
  it("formatta la data nel fuso di Roma (mezzanotte UTC e' gia' il giorno dopo)", () => {
    expect(formatDateRome(NOW)).toBe("07/11/2026");
    expect(formatDateRome(Date.UTC(2026, 5, 30, 23, 30))).toBe("01/07/2026");
  });
});

describe("variabili", () => {
  it("include i dati dell'azienda e del cliente", () => {
    const v = buildVariables(client, { now: NOW, number: "CTR-2026-001" });
    expect(v["company.name"]).toBe("CORE829 SRL");
    expect(v["company.cui"]).toBe(COMPANY.cui);
    expect(v["client.name"]).toBe("Acme Srl");
    expect(v["client.vat"]).toBe("IT01234567890");
    expect(v["client.pec"]).toBe("acme@pec.it");
    expect(v["contract.number"]).toBe("CTR-2026-001");
    expect(v["place.date"]).toBe("Roman, 07/11/2026");
  });
  it("omette i dati del cliente mancanti invece di scrivere vuoti", () => {
    const v = buildVariables({ ...client, phone: null, vatId: null, address: null, pec: null, legalRep: null, website: null }, { now: NOW, number: "X" });
    for (const k of ["client.phone", "client.vat", "client.address", "client.pec", "client.legalRep", "client.website"]) expect(v).not.toHaveProperty(k);
  });
});

describe("regole per etichetta", () => {
  it.each([
    ["Sede legale", "client.address"],
    ["Sede legale / residenza:", "client.address"],
    ["Partita IVA", "client.vat"],
    ["P. IVA / VAT ID", "client.vat"],
    ["PEC", "client.pec"],
    ["Email", "client.email"],
    ["Telefono", "client.phone"],
    ["Rappresentante legale", "client.legalRep"],
    ["Referente", "client.contact"],
    ["Sito web", "client.website"],
    ["CLIENTE", "client.name"],
    ["Luogo e data", "place.date"],
    ["Riferimento MSA n.", "contract.number"],
    ["Data di emissione", "contract.date"],
  ])("%s -> %s", (label, key) => expect(variableForLabel(label)).toBe(key));

  it.each(["Forma giuridica", "Codice fiscale", "Codice SDI", "Paese", "Indirizzo di fatturazione (se diverso)", "", "x".repeat(200)])(
    "ambigua o sconosciuta: %j resta vuota",
    (label) => expect(variableForLabel(label)).toBeNull(),
  );
  it("un testo lungo in frase non si compila mai", () => {
    expect(variableForLabel("Il cliente dichiara di avere ricevuto la sede legale della società e di accettare i termini qui descritti")).toBeNull();
  });
});

describe("autofillFields", () => {
  const vars = buildVariables(client, { now: NOW, number: "CTR-2026-001" });
  const f = (id: string, label: string, paragraph: number, kind: "blank" | "checkbox" = "blank") => ({ id, kind, label, paragraph });

  it("compila i campi riconosciuti e salta caselle e sconosciuti", () => {
    const r = autofillFields([f("a", "PEC", 1), f("b", "Forma giuridica", 2), f("c", "PEC", 3, "checkbox")], vars);
    expect(r.fills).toEqual({ a: "acme@pec.it" });
    expect(r.filled).toEqual([{ label: "PEC", value: "acme@pec.it" }]);
  });
  it("non duplica il dato nelle celle adiacenti con la stessa etichetta", () => {
    const r = autofillFields([f("a", "Telefono", 10), f("b", "Telefono", 11)], vars);
    expect(Object.keys(r.fills)).toEqual(["a"]);
  });
  it("compila di nuovo se l'etichetta ricompare lontano", () => {
    const r = autofillFields([f("a", "CLIENTE", 10), f("b", "CLIENTE", 100)], vars);
    expect(Object.keys(r.fills)).toEqual(["a", "b"]);
  });
  it("non compila se il dato del cliente manca", () => {
    const v = buildVariables({ ...client, pec: null }, { now: NOW, number: "X" });
    expect(autofillFields([f("a", "PEC", 1)], v).fills).toEqual({});
  });
});

describe("documento DOCX completo", () => {
  it("compila tabella a due colonne e segnaposto in un colpo", () => {
    const files = readDocx(
      createBlankDocx([
        { type: "title", text: "Contratto {{contract.number}}" },
        { type: "table", rows: [["Cliente", ""], ["Partita IVA", ""], ["Forma giuridica", ""], ["PEC", ""]] },
        { type: "p", text: "Firmato da {{company.rep}} per {{company.name}}" },
      ]),
    );
    const vars = buildVariables(client, { now: NOW, number: "CTR-2026-007" });
    const { fills, filled } = autofillFields(detectFields(listParagraphs(files)), vars);
    const out = listParagraphs(applyChanges(files, { fills, vars })).map((p) => p.text);
    expect(out).toContain("Contratto CTR-2026-007");
    expect(out).toContain("Acme Srl");
    expect(out).toContain("IT01234567890");
    expect(out).toContain("acme@pec.it");
    expect(out).toContain("Firmato da Stefan Serban per CORE829 SRL");
    expect(filled.map((x) => x.label).sort()).toEqual(["Cliente", "PEC", "Partita IVA"]);
    expect(filled.some((x) => x.label === "Forma giuridica")).toBe(false);
  });
});

const REAL = process.env.MSA_FIXTURE ?? "/tmp/msa/msa.docx";
describe.skipIf(!existsSync(REAL))("MSA reale (solo in locale)", () => {
  it("compila i dati del cliente e lascia vuoti i campi ambigui", () => {
    const files = readDocx(new Uint8Array(readFileSync(REAL)));
    const paragraphs = listParagraphs(files);
    const vars = buildVariables(client, { now: NOW, number: "CTR-2026-001" });
    const { fills, filled } = autofillFields(detectFields(paragraphs), vars);
    const out = listParagraphs(applyChanges(files, { fills, vars }));
    const fields = detectFields(paragraphs);
    const landed = (label: string) =>
      fields.filter((f) => f.id in fills && f.label.toLowerCase().startsWith(label.toLowerCase())).map((f) => out[f.paragraph].text);
    expect(filled.length).toBeGreaterThan(15);
    expect(landed("Denominazione")).toEqual(["Acme Srl"]);
    expect(landed("P. IVA")).toEqual(["IT01234567890"]);
    expect(landed("PEC")).toEqual(["acme@pec.it"]);
    expect(landed("Email amministrativa")).toEqual(["mario@acme.it"]);
    expect(landed("Telefono")).toEqual(["+39 333 1234567"]);
    expect(landed("Sede legale")).toEqual(["Via Roma 1, Milano"]);
    expect(landed("Riferimento MSA")).toEqual(["CTR-2026-001"]);
    expect(landed("LUOGO E DATA").length).toBeGreaterThan(0);
    // I campi ambigui restano vuoti.
    for (const label of ["Forma giuridica", "Codice fiscale", "SDI", "Paese", "Indirizzo di fatturazione"]) expect(landed(label)).toEqual([]);
  });
});
