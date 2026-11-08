/** Testi e versione del consenso alla firma elettronica. Modulo senza dipendenze: lo usano server (certificato) e browser (casella di consenso). */

export const CONSENT_VERSION = "v1-2026-11";
export const SIGN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const FRESH_CODE_MS = 10 * 60 * 1000;

export const CONSENT_TEXTS = [
  "Dichiaro di aver letto e compreso il documento e di accettarne il contenuto.",
  "Accetto di sottoscriverlo con firma elettronica, mediante il codice monouso ricevuto sulla mia email, e riconosco che la data, l'ora e l'indirizzo IP della sottoscrizione saranno conservati come prova.",
] as const;

