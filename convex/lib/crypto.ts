/**
 * Primitive crittografiche (Web Crypto, disponibile nel runtime Convex).
 * Nessun segreto viene mai salvato in chiaro: si salvano solo hash.
 */

const TOKEN_BYTES = 32;
/** Lunghezza in caratteri di 32 byte codificati in base64url senza padding. */
export const TOKEN_LENGTH = 43;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Token casuale da 256 bit, sicuro per URL. */
export function randomToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** Verifica solo la forma del token, senza dire nulla sulla sua validita'. */
export function isWellFormedToken(value: unknown): value is string {
  return typeof value === "string" && value.length === TOKEN_LENGTH && /^[A-Za-z0-9_-]+$/.test(value);
}

/**
 * Cifre decimali uniformi. Si scartano i byte >= 250 per evitare il "modulo bias"
 * (altrimenti alcune cifre uscirebbero piu' spesso di altre).
 */
export function randomDigits(length: number): string {
  const out: string[] = [];
  const buffer = new Uint8Array(1);
  while (out.length < length) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < 250) out.push(String(buffer[0] % 10));
  }
  return out.join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Confronto a tempo costante tra due stringhe (evita di rivelare quanti caratteri coincidono). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
