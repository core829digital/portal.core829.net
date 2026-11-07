import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import {
  assertCents,
  assertIntInRange,
  assertTimestamp,
  cleanEmail,
  cleanFileName,
  cleanHttpsUrl,
  cleanPhone,
  cleanText,
  escapeHtml,
} from "./text";

function errorOf(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

describe("cleanText", () => {
  it("normalizza spazi e a-capo nei campi a riga singola", () => {
    expect(cleanText("  Ciao \n  mondo\t!  ", { field: "t", max: 50 })).toBe("Ciao mondo !");
  });

  it("mantiene gli a-capo nei campi multilinea, ma ne limita il numero", () => {
    expect(cleanText("a\n\n\n\nb", { field: "t", max: 50, multiline: true })).toBe("a\n\nb");
  });

  it("rimuove caratteri invisibili e di controllo della direzione del testo", () => {
    const attack = "admin\u202Egnp.exe\u200B\u0000";
    expect(cleanText(attack, { field: "t", max: 50 })).toBe("admingnp.exe");
  });

  it("rifiuta testo piu' lungo del massimo", () => {
    const e = errorOf(() => cleanText("a".repeat(11), { field: "titolo", max: 10 }));
    expect(e).toBeInstanceOf(ConvexError);
    expect((e as ConvexError<{ code: string; field: string }>).data).toMatchObject({
      code: "VALIDATION",
      field: "titolo",
    });
  });

  it("rifiuta input enormi senza elaborarli", () => {
    expect(errorOf(() => cleanText("x".repeat(1_000_000), { field: "t", max: 10 }))).toBeInstanceOf(ConvexError);
  });

  it("rifiuta valori che non sono stringhe", () => {
    expect(errorOf(() => cleanText(123, { field: "t", max: 10 }))).toBeInstanceOf(ConvexError);
    expect(errorOf(() => cleanText({ $gt: "" }, { field: "t", max: 10 }))).toBeInstanceOf(ConvexError);
  });

  it("rifiuta surrogati spaiati", () => {
    expect(errorOf(() => cleanText("ab\uD800cd", { field: "t", max: 10 }))).toBeInstanceOf(ConvexError);
  });

  it("applica il minimo di lunghezza", () => {
    expect(errorOf(() => cleanText("   ", { field: "t", min: 1, max: 10 }))).toBeInstanceOf(ConvexError);
  });

  it("conta i caratteri Unicode reali (emoji = 1)", () => {
    expect(cleanText("😀😀😀", { field: "t", max: 3 })).toBe("😀😀😀");
  });
});

describe("cleanEmail", () => {
  it("normalizza in minuscolo", () => {
    expect(cleanEmail("  Mario.Rossi@Esempio.IT ")).toBe("mario.rossi@esempio.it");
  });
  it.each(["no-at.it", "a@b", "a@@b.it", "a b@c.it", "a@b..it", "<script>@x.it"])("rifiuta %s", (bad) => {
    expect(errorOf(() => cleanEmail(bad))).toBeInstanceOf(ConvexError);
  });
});

describe("cleanPhone", () => {
  it("accetta formati comuni", () => {
    expect(cleanPhone("+39 333 766 0481")).toBe("+39 333 766 0481");
  });
  it("rifiuta lettere e caratteri speciali", () => {
    expect(errorOf(() => cleanPhone("333-abc"))).toBeInstanceOf(ConvexError);
    expect(errorOf(() => cleanPhone("123; DROP"))).toBeInstanceOf(ConvexError);
  });
});

describe("cleanFileName", () => {
  it("elimina percorsi e traversal", () => {
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
    expect(cleanFileName("C:\\Users\\x\\contratto.pdf")).toBe("contratto.pdf");
  });
  it("neutralizza file nascosti e caratteri speciali", () => {
    expect(cleanFileName(".htaccess")).toBe("htaccess");
    expect(cleanFileName("fattura<1>|.pdf")).toBe("fattura_1__.pdf");
  });
  it("mantiene lettere accentate", () => {
    expect(cleanFileName("Preventivo città.pdf")).toBe("Preventivo città.pdf");
  });
  it("rifiuta nomi vuoti dopo la pulizia", () => {
    expect(errorOf(() => cleanFileName("///"))).toBeInstanceOf(ConvexError);
  });
});

describe("escapeHtml", () => {
  it("neutralizza markup e attributi", () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;",
    );
  });
  it("neutralizza & e backtick", () => {
    expect(escapeHtml("a&b`c")).toBe("a&amp;b&#96;c");
  });
});

describe("cleanHttpsUrl", () => {
  it("accetta https", () => {
    expect(cleanHttpsUrl("https://www.core829.net/a?b=1")).toBe("https://www.core829.net/a?b=1");
  });
  // Input volutamente malevoli: il test verifica che vengano rifiutati.
  const badUrls = [
    // eslint-disable-next-line no-script-url
    "javascript:alert(1)",
    "data:text/html,x",
    "http://esempio.it",
    "https://user:pw@esempio.it",
    "non un url",
  ];
  it.each(badUrls)("rifiuta %s", (bad) => {
    expect(errorOf(() => cleanHttpsUrl(bad))).toBeInstanceOf(ConvexError);
  });
});

describe("valori numerici", () => {
  it("importi in centesimi: solo interi non negativi", () => {
    expect(assertCents(39000)).toBe(39000);
    for (const bad of [-1, 1.5, NaN, Infinity, "100", 2_000_000_000]) {
      expect(errorOf(() => assertCents(bad))).toBeInstanceOf(ConvexError);
    }
  });
  it("intervalli interi", () => {
    expect(assertIntInRange(50, 0, 100, "p")).toBe(50);
    expect(errorOf(() => assertIntInRange(101, 0, 100, "p"))).toBeInstanceOf(ConvexError);
  });
  it("timestamp tra 2000 e 2100", () => {
    expect(assertTimestamp(Date.UTC(2026, 10, 7), "d")).toBe(Date.UTC(2026, 10, 7));
    expect(errorOf(() => assertTimestamp(0, "d"))).toBeInstanceOf(ConvexError);
    expect(errorOf(() => assertTimestamp(NaN, "d"))).toBeInstanceOf(ConvexError);
  });
});
