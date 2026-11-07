import { describe, expect, it } from "vitest";
import { ONBOARDING_FLAG_KEY, ONBOARDING_SCRIPT, ONBOARDING_SEEN_ATTRIBUTE } from "./onboardingFlag";

describe("script della scheda introduttiva", () => {
  it("e' una costante senza dati esterni: nessuna interpolazione oltre alle due costanti", () => {
    expect(ONBOARDING_SCRIPT).toContain(JSON.stringify(ONBOARDING_FLAG_KEY));
    expect(ONBOARDING_SCRIPT).toContain(JSON.stringify(ONBOARDING_SEEN_ATTRIBUTE));
    expect(ONBOARDING_SCRIPT).not.toMatch(/\$\{|fetch|XMLHttpRequest|eval|document\.write|innerHTML|location|cookie/);
  });
  it("e' JavaScript valido, non fallisce nemmeno se localStorage e' bloccato", () => {
    const run = (storage: unknown) => {
      const attrs: Record<string, string> = {};
      // eslint-disable-next-line no-new-func -- esegue una costante di progetto (non dati esterni) per verificarla
      new Function("localStorage", "document", ONBOARDING_SCRIPT)(storage, { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } });
      return attrs;
    };
    expect(run({ getItem: () => "1" })).toEqual({ [ONBOARDING_SEEN_ATTRIBUTE]: "" });
    expect(run({ getItem: () => null })).toEqual({});
    expect(() => run({ getItem: () => { throw new Error("bloccato"); } })).not.toThrow();
  });
});
