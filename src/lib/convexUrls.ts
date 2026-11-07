/**
 * Convex espone due indirizzi per lo stesso deployment:
 *  - `https://nome.convex.cloud`  per i dati in tempo reale e i caricamenti;
 *  - `https://nome.convex.site`   per le richieste HTTP (usato dai download dei documenti).
 * Con un dominio personalizzato i due non si ricavano l'uno dall'altro: si imposta NEXT_PUBLIC_CONVEX_SITE_URL.
 */
export function deriveConvexSiteUrl(convexUrl: string | undefined, override?: string): string | null {
  if (override) {
    try {
      return new URL(override).origin;
    } catch {
      return null;
    }
  }
  if (!convexUrl) return null;
  try {
    const u = new URL(convexUrl);
    if (u.protocol === "https:" && u.hostname.endsWith(".convex.cloud")) {
      return `https://${u.hostname.slice(0, -".convex.cloud".length)}.convex.site`;
    }
  } catch {
    // URL non valido: nessun indirizzo ricavabile.
  }
  return null;
}
