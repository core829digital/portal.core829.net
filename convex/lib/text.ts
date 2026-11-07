import { ConvexError } from "convex/values";

/**
 * Validazione e sanificazione degli input testuali.
 *
 * Principio: il portale salva SOLO testo semplice e lo mostra sempre tramite React (che applica
 * l'escape). Non si "ripulisce" HTML con espressioni regolari (fragile): si rifiuta o si normalizza
 * il testo, e dove serve HTML (email) si usa `escapeHtml`.
 *
 * Questi helper sono usati lato Convex (unica fonte di verita') e riutilizzabili da Next.
 */

export type ValidationErrorData = { code: "VALIDATION"; field: string; message: string };

/** Errore di validazione con messaggio sicuro da mostrare all'utente (nessun dettaglio interno). */
export function invalid(field: string, message: string): never {
  throw new ConvexError<ValidationErrorData>({ code: "VALIDATION", field, message });
}

// Caratteri di controllo C0/C1 (tranne tab e a-capo, gestiti a parte) e DEL.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
// Caratteri invisibili e di controllo della direzione del testo (attacchi "Trojan Source" / spoofing).
const INVISIBLE_AND_BIDI = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
// Surrogati spaiati (stringhe UTF-16 non valide).
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export type TextOptions = {
  /** Nome del campo, usato nel messaggio d'errore. */
  field: string;
  /** Lunghezza minima in caratteri (default 0). */
  min?: number;
  /** Lunghezza massima in caratteri. Obbligatoria: nessun testo e' illimitato. */
  max: number;
  /** Se true, mantiene gli a-capo (campi descrittivi). Se false, tutto su una riga. */
  multiline?: boolean;
};

export function cleanText(raw: unknown, opts: TextOptions): string {
  const { field, min = 0, max, multiline = false } = opts;
  if (typeof raw !== "string") invalid(field, "Valore non valido.");
  // Protezione da input enormi prima di qualsiasi elaborazione.
  if (raw.length > max * 4 + 16) invalid(field, `Massimo ${max} caratteri.`);
  if (LONE_SURROGATE.test(raw)) invalid(field, "Contiene caratteri non validi.");

  let s = raw.normalize("NFC");
  s = s.replace(/\r\n?|\u2028|\u2029/g, "\n");
  s = s.replace(INVISIBLE_AND_BIDI, "");
  // Tab e a-capo sono gli unici controlli ammessi, e solo nei campi multilinea.
  s = s.replace(CONTROL_CHARS, "");
  if (multiline) {
    s = s.replace(/\t/g, " ").replace(/[ ]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  } else {
    s = s.replace(/\s+/g, " ").trim();
  }

  const length = Array.from(s).length;
  if (length < min) invalid(field, min === 1 ? "Campo obbligatorio." : `Minimo ${min} caratteri.`);
  if (length > max) invalid(field, `Massimo ${max} caratteri.`);
  return s;
}

const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Email normalizzata in minuscolo e validata. */
export function cleanEmail(raw: unknown, field = "email"): string {
  const s = cleanText(raw, { field, min: 3, max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(s) || s.includes("..")) invalid(field, "Indirizzo email non valido.");
  return s;
}

/** Numero di telefono: solo cifre, spazi e + ( ) - . ; 6-20 caratteri. */
export function cleanPhone(raw: unknown, field = "telefono"): string {
  const s = cleanText(raw, { field, min: 6, max: 20 });
  if (!/^\+?[0-9 ()./-]{6,20}$/.test(s)) invalid(field, "Numero di telefono non valido.");
  return s;
}

/**
 * Nome file sicuro: niente percorsi, niente caratteri speciali, niente file nascosti.
 * Il contenuto reale del file si controlla separatamente (Fase 6).
 */
export function cleanFileName(raw: unknown, field = "nome file"): string {
  let s = cleanText(raw, { field, min: 1, max: 255 });
  // Solo l'ultimo segmento, qualunque sia il separatore.
  s = s.split(/[\\/]/).pop() ?? "";
  s = s.replace(/[^\p{L}\p{N}._() -]/gu, "_").replace(/\.{2,}/g, ".").replace(/^\.+/, "");
  s = s.slice(0, 120).trim();
  if (s.length === 0) invalid(field, "Nome file non valido.");
  return s;
}

/** Escape HTML per qualsiasi testo inserito in un'email o in markup costruito a mano. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

/** URL esterno ammesso: solo https, senza credenziali incorporate. Restituisce l'URL normalizzato. */
export function cleanHttpsUrl(raw: unknown, field = "link"): string {
  const s = cleanText(raw, { field, min: 1, max: 2048 });
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return invalid(field, "Link non valido.");
  }
  if (u.protocol !== "https:") invalid(field, "Sono ammessi solo link https.");
  if (u.username || u.password) invalid(field, "Link non valido.");
  return u.href;
}

/** Partita IVA / codice fiscale / CUI: lettere, cifre, spazi, punto e trattino. */
export function cleanVatId(raw: unknown, field = "partita IVA"): string {
  const s = cleanText(raw, { field, min: 4, max: 32 });
  if (!/^[A-Za-z0-9 .-]{4,32}$/.test(s)) invalid(field, "Valore non valido.");
  return s.toUpperCase();
}

/** Importo in centesimi: intero, non negativo, massimo 10 milioni di euro. */
export function assertCents(raw: unknown, field = "importo"): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw)) invalid(field, "Importo non valido.");
  if (raw < 0 || raw > 1_000_000_000) invalid(field, "Importo fuori intervallo.");
  return raw;
}

export function assertIntInRange(raw: unknown, min: number, max: number, field: string): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < min || raw > max) {
    invalid(field, `Deve essere un numero intero tra ${min} e ${max}.`);
  }
  return raw;
}

const MIN_TIMESTAMP = Date.UTC(2000, 0, 1);
const MAX_TIMESTAMP = Date.UTC(2100, 0, 1);

/** Data come timestamp in millisecondi, tra il 2000 e il 2100. */
export function assertTimestamp(raw: unknown, field: string): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < MIN_TIMESTAMP || raw > MAX_TIMESTAMP) {
    invalid(field, "Data non valida.");
  }
  return raw;
}
