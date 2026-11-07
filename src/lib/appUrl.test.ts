import { describe, expect, it } from "vitest";
import { CANONICAL_APP_URL, canonicalAppUrl } from "./appUrl";

describe("canonicalAppUrl", () => {
  it("sostituisce gli indirizzi provvisori di Vercel con il dominio ufficiale", () => {
    expect(canonicalAppUrl("https://portal-core829-net.vercel.app")).toBe(CANONICAL_APP_URL);
    expect(canonicalAppUrl("https://portal-core829-net-git-main-core829.vercel.app/")).toBe(CANONICAL_APP_URL);
  });
  it("lascia il dominio ufficiale e quelli propri (senza barra finale)", () => {
    expect(canonicalAppUrl("https://portal.core829.net/")).toBe("https://portal.core829.net");
    expect(canonicalAppUrl("https://clienti.esempio.it")).toBe("https://clienti.esempio.it");
  });
  it("in sviluppo resta localhost", () => {
    expect(canonicalAppUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });
  it("un valore non valido ricade sul dominio ufficiale", () => {
    expect(canonicalAppUrl("non-un-url")).toBe(CANONICAL_APP_URL);
  });
  it("non si lascia ingannare da host che contengono solo la parola vercel.app", () => {
    expect(canonicalAppUrl("https://vercel.app.evil.com")).toBe("https://vercel.app.evil.com");
  });
});
