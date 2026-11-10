/**
 * Calcoli puri per le date di rinnovo degli abbonamenti e per la formattazione di date e importi (nessun accesso a database o orologio:
 * l'ora arriva dal chiamante, cosi' tutto e' testabile).
 * Le date di rinnovo sono timestamp a mezzanotte UTC del giorno di scadenza.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export type Interval = "month" | "year";

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Aggiunge un mese o un anno a una data (calendario UTC). Il giorno viene mantenuto e, se il mese di
 * arrivo e' piu' corto, ridotto all'ultimo giorno (31 gennaio + 1 mese = 28 febbraio).
 * `anchorDay` e' il giorno "di riferimento" (quello dell'inizio abbonamento): evita che il giorno
 * scivoli verso il basso dopo un mese corto (28 febbraio + 1 mese = 31 marzo, non 28).
 */
export function addInterval(ms: number, interval: Interval, anchorDay?: number): number {
  const d = new Date(ms);
  const day = anchorDay ?? d.getUTCDate();
  const monthsToAdd = interval === "month" ? 1 : 12;
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + monthsToAdd;
  const year = Math.floor(total / 12);
  const monthIndex = total % 12;
  return Date.UTC(year, monthIndex, Math.min(day, daysInMonth(year, monthIndex)));
}

/**
 * Porta `nextRenewalAt` al primo rinnovo futuro: finche' la data e' passata da piu' di un giorno,
 * si aggiunge un intervallo. Con una data ancora valida non cambia nulla.
 */
export function advanceRenewal(nextRenewalAt: number, interval: Interval, now: number, anchorDay?: number): number {
  let next = nextRenewalAt;
  // Limite di sicurezza: 10 anni di rinnovi mensili.
  for (let i = 0; i < 120 && next + DAY_MS < now; i++) next = addInterval(next, interval, anchorDay);
  return next;
}

/** Data come gg/mm/aaaa (UTC), senza dipendere da Intl o dal fuso del server. */
export function formatDateIt(ms: number): string {
  const d = new Date(ms);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** Importo in euro con virgola e simbolo, es. "1.234,50 €". */
export function formatEuroIt(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${euros},${String(abs % 100).padStart(2, "0")} €`;
}
