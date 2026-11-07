import { describe, expect, it } from "vitest";
import { buildPortalLink, extractToken } from "./portalLink";

const TOKEN = "A".repeat(20) + "b".repeat(20) + "_-9";

describe("link del portale", () => {
  it("mette il token nel frammento, non nel percorso ne' nella query", () => {
    const link = buildPortalLink("https://portal.core829.net/", TOKEN);
    expect(link).toBe(`https://portal.core829.net/c#${TOKEN}`);
    const url = new URL(link);
    expect(url.pathname).toBe("/c");
    expect(url.search).toBe("");
  });

  it("estrae il token dal frammento, con o senza #", () => {
    expect(extractToken(`#${TOKEN}`)).toBe(TOKEN);
    expect(extractToken(TOKEN)).toBe(TOKEN);
  });

  it.each(["", "#", "#corto", `#${TOKEN}x`, `#${TOKEN.slice(0, 42)}`, "#<script>alert(1)</script>" + "a".repeat(30), `#${TOKEN.slice(0, 42)}+`])(
    "rifiuta il frammento non valido %s",
    (hash) => {
      expect(extractToken(hash)).toBeNull();
    },
  );

  it("l'andata e il ritorno coincidono", () => {
    expect(extractToken(new URL(buildPortalLink("https://x.it", TOKEN)).hash)).toBe(TOKEN);
  });
});
