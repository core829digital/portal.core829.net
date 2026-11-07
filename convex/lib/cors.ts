/**
 * CORS per l'endpoint di download: il browser puo' leggere la risposta SOLO se la richiesta arriva dal sito
 * del portale (SITE_URL). Non e' una difesa da sola (l'autorizzazione vera e' il token + il codice), ma
 * evita che pagine di altri siti possano usare l'endpoint dal browser di un cliente.
 */
export function corsHeaders(origin: string | null, siteUrl: string | undefined): Record<string, string> {
  if (!origin || !siteUrl) return {};
  let allowed: string;
  try {
    allowed = new URL(siteUrl).origin;
  } catch {
    return {};
  }
  return origin === allowed ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}
