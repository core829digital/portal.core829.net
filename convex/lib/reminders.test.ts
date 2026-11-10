import { describe, expect, it } from "vitest";
import { addInterval, advanceRenewal, formatDateIt, formatEuroIt } from "./reminders";

const d = (y: number, m: number, day: number) => Date.UTC(y, m - 1, day);

describe("addInterval", () => {
  it("aggiunge un mese mantenendo il giorno", () => {
    expect(addInterval(d(2026, 11, 11), "month")).toBe(d(2026, 12, 11));
    expect(addInterval(d(2026, 12, 11), "month")).toBe(d(2027, 1, 11));
  });
  it("riduce al fine mese quando il mese di arrivo e' piu' corto, ma il giorno di riferimento si recupera", () => {
    expect(addInterval(d(2026, 1, 31), "month")).toBe(d(2026, 2, 28));
    expect(addInterval(d(2026, 2, 28), "month", 31)).toBe(d(2026, 3, 31));
  });
  it("aggiunge un anno (anche dal 29 febbraio)", () => {
    expect(addInterval(d(2026, 7, 7), "year")).toBe(d(2027, 7, 7));
    expect(addInterval(d(2028, 2, 29), "year")).toBe(d(2029, 2, 28));
  });
});

describe("advanceRenewal", () => {
  it("non cambia una data ancora valida (anche il giorno stesso)", () => {
    expect(advanceRenewal(d(2026, 11, 11), "month", d(2026, 11, 11) + 5 * 3600_000)).toBe(d(2026, 11, 11));
  });
  it("passa al ciclo successivo dopo un giorno dalla scadenza", () => {
    expect(advanceRenewal(d(2026, 11, 11), "month", d(2026, 11, 12) + 3600_000)).toBe(d(2026, 12, 11));
  });
  it("recupera piu' cicli persi", () => {
    expect(advanceRenewal(d(2026, 1, 11), "month", d(2026, 4, 20))).toBe(d(2026, 5, 11));
  });
});

describe("formattazione", () => {
  it("data e importo all'italiana", () => {
    expect(formatDateIt(d(2026, 11, 11))).toBe("11/11/2026");
    expect(formatEuroIt(10700)).toBe("107,00 €");
    expect(formatEuroIt(123456)).toBe("1.234,56 €");
    expect(formatEuroIt(5)).toBe("0,05 €");
  });
});
