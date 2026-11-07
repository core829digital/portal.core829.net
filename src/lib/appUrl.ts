/** Indirizzo ufficiale del portale: e' quello che i clienti devono vedere nei link che ricevono. */
export const CANONICAL_APP_URL = "https://portal.core829.net";

/**
 * Indirizzo da usare nei link per i clienti. Se la configurazione punta ancora a un indirizzo provvisorio
 * di Vercel (*.vercel.app) si usa quello ufficiale, cosi' i link non escono mai dal dominio di CORE829.
 * In sviluppo (localhost) e con un dominio proprio resta quello configurato.
 */
export function canonicalAppUrl(configured: string): string {
  try {
    const url = new URL(configured);
    if (url.hostname.endsWith(".vercel.app")) return CANONICAL_APP_URL;
    return url.origin;
  } catch {
    return CANONICAL_APP_URL;
  }
}
