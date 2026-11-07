import { describe, expect, it } from "vitest";
import { corsHeaders } from "./cors";

describe("corsHeaders", () => {
  it("consente solo l'origine del sito del portale", () => {
    expect(corsHeaders("https://portal.core829.net", "https://portal.core829.net/")).toEqual({
      "Access-Control-Allow-Origin": "https://portal.core829.net",
      Vary: "Origin",
    });
  });
  it("nega ogni altra origine, anche simile", () => {
    for (const origin of ["https://evil.com", "https://portal.core829.net.evil.com", "http://portal.core829.net", "null", ""]) {
      expect(corsHeaders(origin, "https://portal.core829.net")).toEqual({});
    }
  });
  it("senza origine o senza configurazione non apre nulla", () => {
    expect(corsHeaders(null, "https://portal.core829.net")).toEqual({});
    expect(corsHeaders("https://portal.core829.net", undefined)).toEqual({});
    expect(corsHeaders("https://portal.core829.net", "non un url")).toEqual({});
  });
});
