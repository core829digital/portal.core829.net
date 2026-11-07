import { describe, expect, it } from "vitest";
import { dateInputToTimestamp, formatCents, formatDate, formatBytes, parseEuroToCents, timestampToDateInput } from "./format";

describe("parseEuroToCents", () => {
  it.each([
    ["390", 39000],
    ["390,50", 39050],
    ["390.5", 39050],
    ["1.234,56", 123456],
    [" 99 € ", 9900],
    ["0,05", 5],
  ])("%s -> %i centesimi", (input, expected) => {
    expect(parseEuroToCents(input)).toBe(expected);
  });
  it.each(["", "abc", "-5", "1,234,56", "12,345", "1e3", "NaN", "10 euro"])("rifiuta %s", (input) => {
    expect(parseEuroToCents(input)).toBeNull();
  });
  it("evita gli errori di arrotondamento dei decimali", () => {
    expect(parseEuroToCents("19,99")).toBe(1999);
    expect(parseEuroToCents("0,29")).toBe(29);
  });
});

describe("dateInputToTimestamp", () => {
  it("restituisce un timestamp stabile a mezzogiorno UTC (nessun salto di giorno col fuso)", () => {
    const ts = dateInputToTimestamp("2026-11-30");
    expect(ts).toBe(Date.UTC(2026, 10, 30, 11));
    expect(formatDate(ts)).toBe("30/11/2026");
  });
  it("rifiuta formati non validi", () => {
    expect(dateInputToTimestamp("30/11/2026")).toBeNull();
    expect(dateInputToTimestamp("")).toBeNull();
  });
});

describe("formatCents / formatDate", () => {
  it("formatta in euro all'italiana", () => {
    expect(formatCents(39000).replace(/\s/g, " ")).toMatch(/^390,00 €$/);
  });
  it("gestisce valori assenti", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
});

describe("timestampToDateInput", () => {
  it("fa il percorso inverso senza spostare il giorno", () => {
    const ts = dateInputToTimestamp("2026-12-31");
    expect(timestampToDateInput(ts)).toBe("2026-12-31");
  });
  it("e' vuoto se manca il valore", () => {
    expect(timestampToDateInput(null)).toBe("");
    expect(timestampToDateInput(undefined)).toBe("");
  });
});

describe("formatBytes", () => {
  it("sceglie l'unita' giusta", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
