import { describe, expect, it } from "vitest";
import type { DeadlineItem } from "@convex/deadlines";
import { groupDeadlines } from "./deadlineGroups";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 15, 10, 0, 0);
const item = (key: string, at: number): DeadlineItem => ({ key, kind: "manual", title: key, clientId: null, clientName: null, at, amountCents: null, manualId: null, category: "other", notes: null, related: [] });

describe("scadenziario: gruppi per urgenza", () => {
  it("divide in scadute / 7 giorni / 30 giorni / più avanti e salta i gruppi vuoti", () => {
    const g = groupDeadlines([item("ieri", NOW - DAY), item("oggi", NOW + 3_600_000), item("tra6", NOW + 6 * DAY), item("tra20", NOW + 20 * DAY), item("tra90", NOW + 90 * DAY)], NOW);
    expect(g.map((b) => [b.id, b.items.map((i) => i.key)])).toEqual([
      ["late", ["ieri"]],
      ["week", ["oggi", "tra6"]],
      ["month", ["tra20"]],
      ["later", ["tra90"]],
    ]);
    expect(groupDeadlines([item("x", NOW + 90 * DAY)], NOW).map((b) => b.id)).toEqual(["later"]);
    expect(groupDeadlines([], NOW)).toEqual([]);
  });

  it("una scadenza di oggi (anche se l'ora è già passata) non è «scaduta»", () => {
    const g = groupDeadlines([item("stamattina", Date.UTC(2026, 10, 15, 6, 0, 0))], NOW);
    expect(g[0].id).toBe("week");
  });
});
