import { describe, expect, it } from "vitest";
import { contentDisposition, extensionOf, inspectFile, MAX_FILE_BYTES } from "./files";

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const PDF_HEAD = "%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const zip = (names: string) => join(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]), enc(names));

const reason = (r: ReturnType<typeof inspectFile>) => (r.ok ? "OK" : r.reason);

describe("inspectFile: file validi", () => {
  it("accetta PDF, PNG, JPEG, DOCX e XLSX con contenuto coerente", () => {
    expect(inspectFile({ fileName: "contratto.pdf", bytes: enc(PDF_HEAD) })).toMatchObject({ ok: true, type: "pdf", mime: "application/pdf" });
    expect(inspectFile({ fileName: "logo.png", bytes: PNG })).toMatchObject({ ok: true, type: "png" });
    expect(inspectFile({ fileName: "foto.JPG", bytes: JPG })).toMatchObject({ ok: true, type: "jpg" });
    expect(inspectFile({ fileName: "foto.jpeg", bytes: JPG })).toMatchObject({ ok: true, type: "jpg" });
    expect(inspectFile({ fileName: "a.docx", bytes: zip("[Content_Types].xml word/document.xml") })).toMatchObject({ ok: true, type: "docx" });
    expect(inspectFile({ fileName: "a.xlsx", bytes: zip("[Content_Types].xml xl/workbook.xml") })).toMatchObject({ ok: true, type: "xlsx" });
  });

  it("un PDF con dati binari compressi che per caso contengono '/JS' non e' un falso allarme", () => {
    const body = enc(`${PDF_HEAD}2 0 obj\n<< /Length 20 >>\nstream\n/JS( dati casuali /Launch \nendstream\nendobj\n`);
    expect(inspectFile({ fileName: "ok.pdf", bytes: body }).ok).toBe(true);
  });
});

describe("inspectFile: file respinti", () => {
  it("file vuoto o troppo grande", () => {
    expect(reason(inspectFile({ fileName: "a.pdf", bytes: new Uint8Array(0) }))).toMatch(/vuoto/);
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set(enc("%PDF-1.7"));
    expect(reason(inspectFile({ fileName: "a.pdf", bytes: big }))).toMatch(/supera/);
  });

  it("estensioni non ammesse, anche con doppia estensione", () => {
    for (const name of ["virus.exe", "script.js", "pagina.html", "immagine.svg", "archivio.zip", "macro.docm", "foglio.xlsm", "fattura.pdf.exe", "senzaestensione", ".pdf"]) {
      expect(inspectFile({ fileName: name, bytes: enc(PDF_HEAD) }).ok, name).toBe(false);
    }
  });

  it("un eseguibile rinominato .pdf viene riconosciuto dal contenuto", () => {
    expect(reason(inspectFile({ fileName: "fattura.pdf", bytes: enc("MZ\x90\x00\x03\x00") }))).toMatch(/eseguibile/);
    expect(reason(inspectFile({ fileName: "fattura.pdf", bytes: Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]) }))).toMatch(/eseguibile/);
    expect(reason(inspectFile({ fileName: "fattura.pdf", bytes: enc("#!/bin/sh\nrm -rf /") }))).toMatch(/eseguibile/);
  });

  it("estensione e contenuto devono coincidere", () => {
    expect(reason(inspectFile({ fileName: "foto.pdf", bytes: PNG }))).toMatch(/non corrisponde/);
    expect(reason(inspectFile({ fileName: "doc.png", bytes: enc(PDF_HEAD) }))).toMatch(/non corrisponde/);
    expect(reason(inspectFile({ fileName: "nota.pdf", bytes: enc("<html><script>alert(1)</script>") }))).toMatch(/non corrisponde/);
  });

  it("PDF con JavaScript o azioni automatiche, anche con il nome offuscato", () => {
    for (const active of ["/JavaScript (app.alert(1))", "/S /JavaScript /JS (x)", "/Launch << /F (cmd.exe) >>", "/EmbeddedFile", "/RichMedia", "/J#61vaScript (x)", "/#4AavaScript (x)"]) {
      const bytes = enc(`${PDF_HEAD}3 0 obj\n<< /Type /Action ${active} >>\nendobj\n`);
      expect(inspectFile({ fileName: "a.pdf", bytes }).ok, active).toBe(false);
    }
  });

  it("documenti Office con macro o senza la struttura attesa", () => {
    expect(reason(inspectFile({ fileName: "a.docx", bytes: zip("[Content_Types].xml word/vbaProject.bin") }))).toMatch(/macro/);
    expect(reason(inspectFile({ fileName: "a.xlsx", bytes: zip("qualcosa.txt") }))).toMatch(/struttura/);
    expect(reason(inspectFile({ fileName: "a.docx", bytes: enc(PDF_HEAD) }))).toMatch(/non corrisponde/);
  });
});

describe("helper", () => {
  it("extensionOf", () => {
    expect(extensionOf("A.PDF")).toBe(".pdf");
    expect(extensionOf("a.tar.gz")).toBe(".gz");
    expect(extensionOf(".pdf")).toBe("");
    expect(extensionOf("nome")).toBe("");
  });

  it("contentDisposition: sempre 'attachment', nessuna possibilita' di iniettare intestazioni", () => {
    const h = contentDisposition('evil"\r\nX-Injected: 1.pdf');
    expect(h.startsWith("attachment;")).toBe(true);
    expect(h).not.toMatch(/[\r\n]/);
    expect(h).toContain("filename*=UTF-8''");
    expect(contentDisposition("Preventivo città.pdf")).toContain("filename*=UTF-8''Preventivo%20citt%C3%A0.pdf");
  });
});
