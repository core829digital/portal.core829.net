import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Brand CORE829 (Guidelines 1.0): Nero Pista #141416, Bianco Polare #F8F8F8, Rosso Racing #FF2743.
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

describe("palette CORE829 (Brand Guidelines 1.0)", () => {
  it("usa esattamente i tre colori del brand", () => {
    expect(token("nero-pista")).toBe("#141416");
    expect(token("bianco-polare")).toBe("#f8f8f8");
    expect(token("rosso-racing")).toBe("#ff2743");
    expect(token("foreground")).toBe("#141416");
    expect(token("background")).toBe("#f8f8f8");
    expect(token("brand-red")).toBe("#ff2743");
  });

  it("testo normale: almeno 4,5:1 sulle superfici in cui compare", () => {
    const bg = [token("background"), token("surface"), token("muted")];
    for (const b of bg) {
      expect(contrast(token("foreground"), b), `testo su ${b}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token("muted-foreground"), b), `testo secondario su ${b}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token("brand-red-deep"), b), `rosso scuro su ${b}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(token("brand-red-deep"), token("brand-tint"))).toBeGreaterThanOrEqual(4.5);
  });

  it("pulsante primario: testo Nero Pista su Rosso Racing almeno 4,5:1 (il bianco su rosso, 3,5:1, vale solo per testi grandi)", () => {
    expect(contrast(token("primary-foreground"), token("primary"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("bianco-polare"), token("rosso-racing"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token("rosso-racing"), token("nero-pista"))).toBeGreaterThanOrEqual(3);
  });

  it("sezioni scure: testo su Nero Pista leggibile", () => {
    const ink = "#141416";
    expect(contrast("#f8f8f8", ink)).toBeGreaterThanOrEqual(7);
    expect(contrast("#a8a8ad", ink)).toBeGreaterThanOrEqual(4.5);
  });
});
