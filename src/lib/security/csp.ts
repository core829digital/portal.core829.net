import { deriveConvexSiteUrl } from "@/lib/convexUrls";

/**
 * Costruzione della Content-Security-Policy.
 * Funzione pura (nessun accesso a process.env o a Next) cosi' e' testabile.
 */

export type CspOptions = {
  /** Nonce casuale, nuovo a ogni richiesta. */
  nonce: string;
  /** In sviluppo React richiede `unsafe-eval` per i messaggi di debug. */
  isDev: boolean;
  /** URL del deployment Convex (es. https://xxx.convex.cloud). Se assente, si usa il dominio generico. */
  convexUrl?: string;
  /** Indirizzo HTTP del deployment (es. https://xxx.convex.site), usato dai download. Se assente si ricava da convexUrl. */
  convexSiteUrl?: string;
};

function convexConnectSources(convexUrl?: string, convexSiteUrl?: string): string[] {
  const site = deriveConvexSiteUrl(convexUrl, convexSiteUrl);
  if (convexUrl) {
    try {
      const u = new URL(convexUrl);
      const wsScheme = u.protocol === "https:" ? "wss:" : "ws:";
      return [u.origin, `${wsScheme}//${u.host}`, ...(site ? [site] : [])];
    } catch {
      // URL non valido: ricade sul dominio generico qui sotto.
    }
  }
  return ["https://*.convex.cloud", "wss://*.convex.cloud", "https://*.convex.site"];
}

export function buildCsp({ nonce, isDev, convexUrl, convexSiteUrl }: CspOptions): string {
  const convex = convexConnectSources(convexUrl, convexSiteUrl);
  const devConnect = isDev ? ["http://localhost:*", "ws://localhost:*", "http://127.0.0.1:*", "ws://127.0.0.1:*"] : [];

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    // Solo script con il nonce di questa richiesta; `strict-dynamic` propaga la fiducia
    // agli script caricati da quelli fidati. Nessun `unsafe-inline` in produzione.
    ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])]],
    // Gli elementi <style> richiedono il nonce. Gli attributi style="" inline (usati dai componenti UI)
    // sono consentiti separatamente: non eseguono codice.
    // In sviluppo il pulsante degli strumenti di Next.js inietta stili inline senza nonce: servono
    // `unsafe-inline` solo li'. Il nonce va tolto in quel caso, perche' con un nonce presente il
    // browser ignorerebbe `unsafe-inline`. In produzione resta il solo nonce.
    ["style-src", isDev ? ["'self'", "'unsafe-inline'"] : ["'self'", `'nonce-${nonce}'`]],
    ["style-src-attr", ["'unsafe-inline'"]],
    ["img-src", ["'self'", "blob:", "data:"]],
    ["font-src", ["'self'"]],
    ["connect-src", ["'self'", ...convex, ...devConnect]],
    ["media-src", ["'self'"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["frame-src", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];

  const parts = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  // In sviluppo si usa http://localhost: forzare HTTPS lo romperebbe.
  if (!isDev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** Nonce da 128 bit, base64. Usa Web Crypto (disponibile nel runtime del proxy). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
