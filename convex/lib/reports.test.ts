import { describe, expect, it } from "vitest";
import { catalogMetric, cleanMetrics, formatMetricValue, groupMetrics, isMonthStart, matchSheetRows, METRIC_CATALOG, metricDelta, monthLabel } from "./reports";

describe("catalogo", () => {
  it("ha chiavi uniche e coerenti", () => {
    const keys = METRIC_CATALOG.flatMap((g) => g.metrics.map((m) => m.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(60);
    expect(catalogMetric("web.visits")).toMatchObject({ label: "Visite al sito", unit: "count" });
    expect(catalogMetric("social.tiktok.followers")).toBeDefined();
  });
});

describe("formattazione", () => {
  it("formatta numeri, percentuali, euro e durate all'italiana", () => {
    expect(formatMetricValue(12345, "count")).toBe("12.345");
    expect(formatMetricValue(12.34, "percent")).toBe("12,3%");
    expect(formatMetricValue(1234.5, "eur")).toMatch(/^1\.?234,50\s€$/);
    expect(formatMetricValue(3.456, "decimal")).toBe("3,46");
    expect(formatMetricValue(45, "seconds")).toBe("45 s");
    expect(formatMetricValue(125, "seconds")).toBe("2 min 05 s");
  });
  it("calcola la variazione sul mese prima", () => {
    expect(metricDelta(150, 100, "count")).toEqual({ text: "+50%", direction: "up" });
    expect(metricDelta(50, 100, "count")).toEqual({ text: "-50%", direction: "down" });
    expect(metricDelta(10, 10, "count")).toEqual({ text: "0%", direction: "flat" });
    expect(metricDelta(5, 0, "count")).toBeNull();
    expect(metricDelta(0, 0, "count")).toEqual({ text: "invariato", direction: "flat" });
    expect(metricDelta(5, undefined, "count")).toBeNull();
    expect(metricDelta(45.5, 40, "percent")).toEqual({ text: "+5,5 punti", direction: "up" });
  });
  it("riconosce il primo del mese e dice il mese in italiano", () => {
    expect(isMonthStart(Date.UTC(2026, 10, 1))).toBe(true);
    expect(isMonthStart(Date.UTC(2026, 10, 2))).toBe(false);
    expect(isMonthStart(Date.UTC(2026, 10, 1, 1))).toBe(false);
    expect(isMonthStart(NaN)).toBe(false);
    expect(monthLabel(Date.UTC(2026, 10, 1))).toBe("novembre 2026");
  });
});

describe("controllo metriche", () => {
  it("per le voci del catalogo etichetta e unita' non si possono falsificare", () => {
    const [m] = cleanMetrics([{ key: "web.visits", label: "<b>X</b>", unit: "eur", value: 10 }]);
    expect(m).toEqual({ key: "web.visits", label: "Visite al sito", unit: "count", value: 10 });
  });
  it("accetta metriche personalizzate valide e rifiuta il resto", () => {
    expect(cleanMetrics([{ key: "custom.newsletter", label: "Iscritti newsletter", unit: "count", value: 3, note: "da Mailchimp" }])[0]).toMatchObject({ note: "da Mailchimp" });
    expect(() => cleanMetrics([{ key: "altro.cosa", label: "x", unit: "count", value: 1 }])).toThrow();
    expect(() => cleanMetrics([{ key: "custom.x", label: "x", unit: "boh", value: 1 }])).toThrow();
    expect(() => cleanMetrics([{ key: "custom.x", label: "", unit: "count", value: 1 }])).toThrow();
    expect(() => cleanMetrics([{ key: "web.visits", value: Infinity }])).toThrow();
    expect(() => cleanMetrics([{ key: "web.visits", value: 1e13 }])).toThrow();
    expect(() => cleanMetrics([{ key: "web.visits", value: 1 }, { key: "web.visits", value: 2 }])).toThrow();
    expect(() => cleanMetrics(Array.from({ length: 201 }, (_, i) => ({ key: `custom.m${i}`, label: "x", unit: "count", value: 1 })))).toThrow();
  });
  it("raggruppa nell'ordine del catalogo con le personalizzate in fondo", () => {
    const g = groupMetrics([{ key: "custom.a" }, { key: "social.instagram.followers" }, { key: "web.visits" }]);
    expect(g.map((x) => x.id)).toEqual(["web", "social.instagram", "custom"]);
  });
});

describe("importazione da foglio", () => {
  it("abbina nomi e valori italiani (anche con prefisso della piattaforma) e segnala il resto", () => {
    const r = matchSheetRows([
      ["Metrica", "Valore"],
      ["Visite al sito", "1.520"],
      ["Frequenza di rimbalzo", "45,5%"],
      ["Instagram Follower totali", "1200"],
      ["Follower totali", "9"],
      ["Spesa pubblicitaria", "€ 350,50"],
      ["Cosa strana", "7"],
      ["Vuota", ""],
    ]);
    expect(r.matched).toEqual([
      { key: "web.visits", value: 1520 },
      { key: "web.bounce", value: 45.5 },
      { key: "social.instagram.followers", value: 1200 },
      { key: "ads.spend", value: 350.5 },
    ]);
    expect(r.unmatched).toEqual(expect.arrayContaining(["Follower totali", "Cosa strana"]));
  });
});
