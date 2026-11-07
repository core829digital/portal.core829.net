import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce } from "./csp";

function directive(csp: string, name: string): string {
  const found = csp.split("; ").find((d) => d.startsWith(`${name} `));
  if (!found) throw new Error(`direttiva ${name} assente`);
  return found;
}

describe("buildCsp (produzione)", () => {
  const csp = buildCsp({ nonce: "NONCE123", isDev: false, convexUrl: "https://happy-otter-123.convex.cloud" });

  it("consente script solo con nonce, senza unsafe-inline ne' unsafe-eval", () => {
    const script = directive(csp, "script-src");
    expect(script).toContain("'nonce-NONCE123'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("blocca frame, plugin e incorporazione del sito altrove", () => {
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "frame-src")).toBe("frame-src 'none'");
  });

  it("limita base-uri e form-action al proprio dominio", () => {
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "form-action")).toBe("form-action 'self'");
  });

  it("connette solo al deployment Convex indicato (https e wss)", () => {
    const connect = directive(csp, "connect-src");
    expect(connect).toContain("https://happy-otter-123.convex.cloud");
    expect(connect).toContain("wss://happy-otter-123.convex.cloud");
    // L'endpoint HTTP dei download (stesso deployment, dominio .convex.site).
    expect(connect).toContain("https://happy-otter-123.convex.site");
    expect(connect).not.toContain("localhost");
    expect(connect).not.toContain("*");
  });

  it("in produzione gli stili inline NON sono ammessi: solo nonce", () => {
    const style = directive(csp, "style-src");
    expect(style).toContain("'nonce-NONCE123'");
    expect(style).not.toContain("'unsafe-inline'");
  });

  it("forza HTTPS", () => {
    expect(csp).toContain("upgrade-insecure-requests");
  });
});

describe("buildCsp (sviluppo)", () => {
  const csp = buildCsp({ nonce: "N", isDev: true });
  it("ammette unsafe-eval e localhost solo in sviluppo", () => {
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    expect(directive(csp, "connect-src")).toContain("localhost");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
  it("in sviluppo gli stili inline sono ammessi (strumenti di Next.js)", () => {
    expect(directive(csp, "style-src")).toContain("'unsafe-inline'");
  });
  it("senza URL Convex usa il dominio generico convex.cloud", () => {
    expect(directive(csp, "connect-src")).toContain("https://*.convex.cloud");
  });
  it("con un dominio personalizzato usa l'indirizzo HTTP esplicito", () => {
    const custom = buildCsp({ nonce: "N", isDev: false, convexUrl: "https://db.core829.net", convexSiteUrl: "https://api.core829.net" });
    expect(directive(custom, "connect-src")).toContain("https://api.core829.net");
  });
});

describe("buildCsp con URL non valido", () => {
  it("ricade sul dominio generico invece di rompersi", () => {
    const csp = buildCsp({ nonce: "N", isDev: false, convexUrl: "non-un-url" });
    expect(directive(csp, "connect-src")).toContain("https://*.convex.cloud");
  });
});

describe("generateNonce", () => {
  it("produce 16 byte casuali in base64, diversi a ogni chiamata", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const n = generateNonce();
      expect(atob(n).length).toBe(16);
      seen.add(n);
    }
    expect(seen.size).toBe(200);
  });
});
