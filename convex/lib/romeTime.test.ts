import { describe, expect, it } from "vitest";
import { isReminderWindow, romeDayStart, romeParts } from "./romeTime";

const utc = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min);

describe("orologio di Roma", () => {
  it("ora solare (UTC+1) e ora legale (UTC+2)", () => {
    expect(romeParts(utc(2026, 11, 11, 9, 30))).toMatchObject({ day: 11, hour: 10, minute: 30 });
    expect(romeParts(utc(2026, 7, 14, 8, 30))).toMatchObject({ day: 14, hour: 10, minute: 30 });
  });
  it("mezzanotte di Roma: UTC-1h d'inverno, UTC-2h d'estate", () => {
    expect(romeDayStart(utc(2026, 11, 10, 12), 1)).toBe(utc(2026, 11, 10, 23, 0));
    expect(romeDayStart(utc(2026, 7, 14, 12), 1)).toBe(utc(2026, 7, 14, 22, 0));
  });
  it("giorni del cambio d'ora (29/3/2026 e 25/10/2026): la giornata dura 23 e 25 ore", () => {
    const march = romeDayStart(utc(2026, 3, 28, 12), 1); // mezzanotte del 29/3 (ancora ora solare)
    const marchNext = romeDayStart(utc(2026, 3, 28, 12), 2); // mezzanotte del 30/3 (ora legale)
    expect(march).toBe(utc(2026, 3, 28, 23));
    expect(marchNext).toBe(utc(2026, 3, 29, 22));
    expect((marchNext - march) / 3_600_000).toBe(23);
    const oct = romeDayStart(utc(2026, 10, 24, 12), 1);
    const octNext = romeDayStart(utc(2026, 10, 24, 12), 2);
    expect(oct).toBe(utc(2026, 10, 24, 22));
    expect(octNext).toBe(utc(2026, 10, 25, 23));
    expect((octNext - oct) / 3_600_000).toBe(25);
  });
  it("finestra di invio: dalle 10:30 alle 18:59", () => {
    expect(isReminderWindow(utc(2026, 11, 11, 9, 29))).toBe(false); // 10:29
    expect(isReminderWindow(utc(2026, 11, 11, 9, 30))).toBe(true); // 10:30
    expect(isReminderWindow(utc(2026, 11, 11, 17, 59))).toBe(true); // 18:59
    expect(isReminderWindow(utc(2026, 11, 11, 18, 0))).toBe(false); // 19:00
    expect(isReminderWindow(utc(2026, 7, 14, 8, 30))).toBe(true); // 10:30 estate
    expect(isReminderWindow(utc(2026, 7, 14, 8, 29))).toBe(false);
  });
});
