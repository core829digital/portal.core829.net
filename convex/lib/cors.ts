/**
 * CORS per l'endpoint di download: il browser puo' leggere la risposta SOLO se la richiesta arriva dal sito
 * del portale (SITE_URL). Non e' una difesa da sola (l'autorizzazione vera e' il token + il codice), ma
 * evita che pagine di altri siti possano usare l'endpoint dal browser di un cliente.
 *
 * SITE_URL puo' contenere piu' indirizzi separati da virgola (utile nel passaggio da un dominio all'altro,
 * es. "https://portal.core829.net,https://portal-core829-net.vercel.app"). Il confronto e' esatto.
 */
export function corsHeaders(origin: string | null, siteUrl: string | undefined): Record<string, string> {
  if (!origin || !siteUrl) return {};
  const allowed = new Set<string>();
  for (const part of siteUrl.split(",")) {
    try {
      const trimmed = part.trim();
      if (trimmed !== "") allowed.add(new URL(trimmed).origin);
    } catch {
      // Voce non valida: ignorata.
    }
  }
  return allowed.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}
