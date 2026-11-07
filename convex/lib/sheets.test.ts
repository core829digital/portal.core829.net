import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { MAX_COLS, MAX_ROWS, parseCsv, readSheets, SheetError } from "./sheets";

const CT = '<?xml version="1.0" encoding="UTF-8"?>';
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function xlsx(opts: { sheetXml?: string; extraSheets?: { name: string; xml: string; state?: string }[]; date1904?: boolean } = {}): Uint8Array {
  const sheets = [{ name: "Metriche", xml: opts.sheetXml ?? "<sheetData/>" }, ...(opts.extraSheets ?? [])];
  const files: Record<string, Uint8Array> = {
    "xl/workbook.xml": strToU8(
      `${CT}<workbook ${NS}>${opts.date1904 ? '<workbookPr date1904="1"/>' : ""}<sheets>${sheets
        .map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"${"state" in s && s.state ? ` state="${s.state}"` : ""}/>`)
        .join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${CT}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join("")}</Relationships>`,
    ),
    "xl/sharedStrings.xml": strToU8(`${CT}<sst ${NS}><si><t>Visite sito</t></si><si><r><t>Social</t></r><r><t> Instagram</t></r></si></sst>`),
    "xl/styles.xml": strToU8(
      `${CT}<styleSheet ${NS}><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="9"/><xf numFmtId="164"/></cellXfs></styleSheet>`,
    ),
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(`${CT}<worksheet ${NS}>${s.xml}</worksheet>`)));
  return zipSync(files);
}

describe("lettore fogli di calcolo", () => {
  it("legge testi condivisi, numeri, date, percentuali, booleani e formule (solo valore salvato)", () => {
    const sheetXml = `<sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
      <row r="2"><c r="A2"><v>1520</v></c><c r="B2" s="1"><v>46000</v></c><c r="C2" s="2"><v>0.125</v></c><c r="D2" t="b"><v>1</v></c></row>
      <row r="4"><c r="B4" s="3"><v>46000.5</v></c><c r="C4"><f>SUM(A2:A3)</f><v>1520.3000000000002</v></c><c r="A4" t="inlineStr"><is><t>diretto</t></is></c></row>
    </sheetData>`;
    const [sheet] = readSheets(xlsx({ sheetXml }), "report.xlsx");
    expect(sheet.name).toBe("Metriche");
    expect(sheet.rows[0]).toEqual(["Visite sito", "Social Instagram", "", ""]);
    expect(sheet.rows[1]).toEqual(["1520", "09/12/2025", "12,5%", "Sì"]);
    expect(sheet.rows[2]).toEqual(["", "", "", ""]); // riga vuota mantenuta come spazio
    expect(sheet.rows[3]).toEqual(["diretto", "09/12/2025 12:00", "1520,3", ""]);
    expect(sheet.truncated).toBe(false);
  });
  it("salta i fogli nascosti e rispetta il calendario 1904", () => {
    const sheets = readSheets(
      xlsx({ date1904: true, sheetXml: '<sheetData><row r="1"><c r="A1" s="1"><v>1</v></c></row></sheetData>', extraSheets: [{ name: "Nascosto", xml: "<sheetData/>", state: "hidden" }] }),
      "a.xlsm",
    );
    expect(sheets.map((s) => s.name)).toEqual(["Metriche"]);
    expect(sheets[0].rows[0][0]).toBe("02/01/1904");
  });
  it("taglia righe e colonne oltre i limiti e lo segnala", () => {
    const wide = `<row r="1">${Array.from({ length: MAX_COLS + 5 }, (_, i) => `<c r="${i < 26 ? String.fromCharCode(65 + i) : "A" + String.fromCharCode(65 + i - 26)}1"><v>${i}</v></c>`).join("")}</row>`;
    const tall = Array.from({ length: 3 }, (_, i) => `<row r="${MAX_ROWS + 1 + i}"><c r="A${MAX_ROWS + 1 + i}"><v>1</v></c></row>`).join("");
    const [s] = readSheets(xlsx({ sheetXml: `<sheetData>${wide}${tall}</sheetData>` }), "x.xlsx");
    expect(s.rows[0]).toHaveLength(MAX_COLS);
    expect(s.rows).toHaveLength(1);
    expect(s.truncated).toBe(true);
  });
  it("accorcia le celle lunghe", () => {
    const long = "x".repeat(2000);
    const [s] = readSheets(xlsx({ sheetXml: `<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${long}</t></is></c></row></sheetData>` }), "x.xlsx");
    expect(s.rows[0][0].length).toBeLessThanOrEqual(500);
  });
  it("legge un .ods con date, percentuali e righe/colonne ripetute", () => {
    const content = `${CT}<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet>
      <table:table table:name="Social"><table:table-row>
        <table:table-cell office:value-type="string"><text:p>Follower</text:p></table:table-cell>
        <table:table-cell office:value-type="float" office:value="1200"><text:p>1200</text:p></table:table-cell>
        <table:table-cell office:value-type="percentage" office:value="0.5"/>
        <table:table-cell office:value-type="date" office:date-value="2026-11-07"/>
        <table:table-cell table:number-columns-repeated="3"/>
      </table:table-row></table:table></office:spreadsheet></office:body></office:document-content>`;
    const [s] = readSheets(zipSync({ "content.xml": strToU8(content), mimetype: strToU8("application/vnd.oasis.opendocument.spreadsheet") }), "r.ods");
    expect(s.name).toBe("Social");
    expect(s.rows[0]).toEqual(["Follower", "1200", "50%", "07/11/2026"]);
  });
  it("legge CSV con virgolette, punto e virgola e BOM", () => {
    const s = parseCsv('﻿Nome;Valore\r\n"Rossi; Mario";"12,5"\r\n"Con ""virgolette""";3\r\n\r\n');
    expect(s.rows).toEqual([["Nome", "Valore"], ["Rossi; Mario", "12,5"], ['Con "virgolette"', "3"]]);
    expect(parseCsv("a\tb\n1\t2").rows).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("rifiuta con messaggi chiari file vuoti, troppo grandi, .xls, estensioni false e ZIP che non sono fogli", () => {
    const err = (b: Uint8Array, n: string) => {
      try {
        readSheets(b, n);
      } catch (e) {
        expect(e).toBeInstanceOf(SheetError);
        return (e as Error).message;
      }
      throw new Error("doveva fallire");
    };
    expect(err(new Uint8Array(0), "a.xlsx")).toMatch(/vuoto/);
    expect(err(new Uint8Array(6 * 1024 * 1024), "a.csv")).toMatch(/5 MB/);
    expect(err(new Uint8Array([1, 2, 3]), "vecchio.xls")).toMatch(/\.xlsx/);
    expect(err(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), "finto.xlsx")).toMatch(/\.xlsx/);
    expect(err(strToU8("testo qualunque"), "a.xlsx")).toMatch(/non è un foglio/);
    expect(err(zipSync({ "foo.txt": strToU8("x") }), "a.xlsx")).toMatch(/workbook/);
    expect(err(zipSync({ "foo.txt": strToU8("x") }), "a.csv")).toMatch(/Excel/);
  });
  it("blocca uno ZIP che da' troppi dati una volta aperto", () => {
    const bomb = zipSync({ "xl/workbook.xml": new Uint8Array(70 * 1024 * 1024) });
    expect(bomb.length).toBeLessThan(5 * 1024 * 1024);
    expect(() => readSheets(bomb, "bomba.xlsx")).toThrow(/troppo grande/);
  });
  it("un'entita' XML malevola non viene espansa", () => {
    const evil = zipSync({
      "xl/workbook.xml": strToU8(`${CT}<!DOCTYPE x [<!ENTITY a "AAAAAAAAAA"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><workbook ${NS}><sheets><sheet name="&b;" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      "xl/_rels/workbook.xml.rels": strToU8(`${CT}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`),
      "xl/worksheets/sheet1.xml": strToU8(`${CT}<worksheet ${NS}><sheetData/></worksheet>`),
    });
    const t0 = Date.now();
    try {
      const [s] = readSheets(evil, "e.xlsx");
      expect(s.name.length).toBeLessThanOrEqual(500);
    } catch (e) {
      expect(e).toBeInstanceOf(SheetError);
    }
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
