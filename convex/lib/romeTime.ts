/**
 * Orologio di Roma (Europe/Rome), indipendente dal fuso del server.
 * Serve ai promemoria: "il giorno prima, alle 10:30 ora italiana" deve valere sia con l'ora solare (UTC+1) sia con quella legale (UTC+2).
 */

const FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export type RomeParts = { year: number; month: number; day: number; hour: number; minute: number };

export function romeParts(ms: number): RomeParts {
  const get: Record<string, number> = {};
  for (const p of FORMAT.formatToParts(new Date(ms))) if (p.type !== "literal") get[p.type] = Number(p.value);
  return { year: get.year, month: get.month, day: get.day, hour: get.hour % 24, minute: get.minute };
}

/** Scarto di Roma rispetto a UTC in millisecondi in quell'istante (3.600.000 d'inverno, 7.200.000 d'estate). */
function offsetMs(ms: number): number {
  const p = romeParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ms / 60_000) * 60_000;
}

/** Istante (UTC, in ms) della mezzanotte di Roma del giorno "oggi + offsetDays". */
export function romeDayStart(nowMs: number, offsetDays = 0): number {
  const p = romeParts(nowMs);
  const wallMidnightAsUtc = Date.UTC(p.year, p.month - 1, p.day + offsetDays);
  // Il cambio d'ora avviene di notte (02:00-03:00): due passaggi bastano a convergere anche nei giorni del cambio.
  let guess = wallMidnightAsUtc - offsetMs(wallMidnightAsUtc);
  guess = wallMidnightAsUtc - offsetMs(guess);
  return guess;
}

/** True dalle 10:30 alle 18:59 (ora di Roma): la finestra in cui si spediscono i promemoria. */
export function isReminderWindow(nowMs: number): boolean {
  const { hour, minute } = romeParts(nowMs);
  return (hour === 10 && minute >= 30) || (hour > 10 && hour < 19);
}
