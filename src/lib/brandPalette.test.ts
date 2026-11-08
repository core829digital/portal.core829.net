import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Palette CORE829: Obsidian Black #111217, Ice Grey #DFE5EB, Racing Red #EF233C.
 * Il test legge i token VERI da globals.css e verifica i contrasti WCAG AA (4,5:1 testo normale, 3:1 testo grande):
 * se qualcuno cambia un colore e rompe la leggibilita', fallisce.
 */
const css = readFileSync("src/app/globals.css", "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf(".dark {"));
const token = (name: string) => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(root);
  if (!m) throw new Error(`token --${name} mancante`);
  return m[1].toLowerCase();
};
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("nuova palette CORE829", () => {
  it("usa esattamente i tre colori del brand", () => {
    expect(token("obsidian")).toBe("#111217");
    expect(token("ice-grey")).toBe("#dfe5eb");
    expect(token("racing-red")).toBe("#ef233c");
    expect(token("foreground")).toBe("#111217");
    expect(token("brand-red")).toBe("#ef233c");
    expect(token("border")).toBe("#dfe5eb");
  });

  it("testo normale: almeno 4,5:1 sulle superfici in cui compare", () => {
    const bg = [token("background"), token("surface"), token("muted"), token("ice-grey")];
    for (const b of bg) {
      expect(contrast(token("foreground"), b), `testo su ${b}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token("muted-foreground"), b), `testo secondario su ${b}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token("brand-red-deep"), b), `rosso scuro su ${b}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(token("brand-red-deep"), token("brand-tint"))).toBeGreaterThanOrEqual(4.5);
  });

  it("pulsante primario: testo bianco su rosso almeno 4,5:1 (il Racing Red puro e' riservato a grafica e superfici grandi, >= 3:1)", () => {
    expect(contrast(token("primary-foreground"), token("primary"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff", token("racing-red"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token("racing-red"), token("obsidian"))).toBeGreaterThanOrEqual(3);
  });

  it("sezioni scure: testo su Obsidian leggibile", () => {
    const ink = "#111217";
    expect(contrast("#f2f5f8", ink)).toBeGreaterThanOrEqual(7);
    expect(contrast("#a9b2be", ink)).toBeGreaterThanOrEqual(4.5);
  });
});
