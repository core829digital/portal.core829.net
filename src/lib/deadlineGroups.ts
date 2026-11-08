import type { DeadlineItem } from "@convex/deadlines";

const DAY = 86_400_000;

export type Bucket = { id: string; title: string; tone: "bad" | "warn" | "normal"; items: DeadlineItem[] };

/** Gruppi per urgenza, calcolati dall'ora (arrotondata) passata dal browser. */
export function groupDeadlines(items: DeadlineItem[], now: number): Bucket[] {
  const startOfToday = new Date(now).setUTCHours(0, 0, 0, 0);
  const buckets: Bucket[] = [
    { id: "late", title: "Scadute", tone: "bad", items: [] },
    { id: "week", title: "Entro 7 giorni", tone: "warn", items: [] },
    { id: "month", title: "Entro 30 giorni", tone: "normal", items: [] },
    { id: "later", title: "Più avanti", tone: "normal", items: [] },
  ];
  for (const i of items) {
    const b = i.at < startOfToday ? 0 : i.at < startOfToday + 8 * DAY ? 1 : i.at < startOfToday + 31 * DAY ? 2 : 3;
    buckets[b].items.push(i);
  }
  return buckets.filter((b) => b.items.length > 0);
}
