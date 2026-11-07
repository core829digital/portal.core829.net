/** Formati italiani per importi e date. Gli importi sono sempre interi in centesimi. */

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" });
const dateTimeFormat = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

export function formatCents(cents: number): string {
  return euro.format(cents / 100);
}

export function formatDate(ms: number | null | undefined): string {
  return typeof ms === "number" ? dateFormat.format(ms) : "—";
}

export function formatDateTime(ms: number | null | undefined): string {
  return typeof ms === "number" ? dateTimeFormat.format(ms) : "—";
}

/** "2026-11-30" (campo data di un modulo) -> timestamp a mezzogiorno di Roma, evitando sfasamenti di fuso. */
export function dateInputToTimestamp(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const ts = Date.UTC(y, m - 1, d, 11, 0, 0);
  return Number.isNaN(ts) ? null : ts;
}

/** Importo scritto dall'utente ("390", "390,50", "1.234,56") -> centesimi interi, oppure null se non valido. */
export function parseEuroToCents(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, "").replace(/€/g, "");
  if (cleaned === "") return null;
  // Formato italiano: punto per le migliaia, virgola per i decimali.
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Timestamp -> valore per un campo data ("2026-11-30"). Vuoto se assente. */
export function timestampToDateInput(ms: number | null | undefined): string {
  return typeof ms === "number" ? new Date(ms).toISOString().slice(0, 10) : "";
}

/** Oggi (+ giorni) come valore per un campo data. */
export function todayInput(plusDays = 0): string {
  return new Date(Date.now() + plusDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
