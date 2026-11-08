import { describe, expect, it } from "vitest";
import { slugify } from "./SiteBits";

describe("slugify", () => {
  it("trasforma un titolo in un indirizzo valido per il sito", () => {
    expect(slugify("Perché un sito veloce conta: 5 motivi!")).toBe("perche-un-sito-veloce-conta-5-motivi");
    expect(slugify("  --Ciao   Mondo--  ")).toBe("ciao-mondo");
    expect(slugify("<script>alert(1)</script>")).toBe("script-alert-1-script");
    expect(slugify("ÀÈÌÒÙ")).toBe("aeiou");
    expect(slugify("x".repeat(300))).toHaveLength(120);
    expect(slugify("???")).toBe("");
  });
  it("il risultato rispetta sempre le regole di Andromedia Web (a-z, 0-9, trattini)", () => {
    for (const s of ["Ciao!", "Foiano della Chiana", "E-commerce 2026", "日本語"]) expect(slugify(s)).toMatch(/^[a-z0-9-]*$/);
  });
});
