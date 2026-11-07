/**
 * Il link del cliente e' `https://portale/c#<token>`. Il segreto sta DOPO il `#`: i browser non
 * inviano mai il frammento al server, quindi non finisce nei log di Vercel, nelle intestazioni
 * Referer ne' nelle richieste dei programmi che scansionano i link nelle email.
 */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function buildPortalLink(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/c#${token}`;
}

/** Estrae il token da `location.hash` ("#abc..."). Null se manca o ha una forma non valida. */
export function extractToken(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return TOKEN_RE.test(raw) ? raw : null;
}
