import { cleanText, invalid } from "./text";

/**
 * Report mensile del cliente: catalogo delle metriche, controllo dei valori e formattazione.
 * Funzioni pure (usate da server, browser e PDF): un solo punto dove si decide cosa significa ogni numero.
 */

export type MetricUnit = "count" | "percent" | "eur" | "seconds" | "decimal";
export type CatalogMetric = { key: string; label: string; unit: MetricUnit };
export type CatalogGroup = { id: string; label: string; metrics: CatalogMetric[] };

const PLATFORMS: [string, string][] = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["tiktok", "TikTok"],
  ["linkedin", "LinkedIn"],
  ["youtube", "YouTube"],
];

const social = (id: string, name: string): CatalogGroup => ({
  id: `social.${id}`,
  label: `Social · ${name}`,
  metrics: [
    { key: `social.${id}.followers`, label: "Follower totali", unit: "count" },
    { key: `social.${id}.newFollowers`, label: "Nuovi follower", unit: "count" },
    { key: `social.${id}.reach`, label: "Persone raggiunte", unit: "count" },
    { key: `social.${id}.views`, label: "Visualizzazioni", unit: "count" },
    { key: `social.${id}.engagement`, label: "Interazioni (mi piace, commenti, condivisioni)", unit: "count" },
    { key: `social.${id}.engagementRate`, label: "Tasso di interazione", unit: "percent" },
    { key: `social.${id}.posts`, label: "Contenuti pubblicati", unit: "count" },
    { key: `social.${id}.videoViews`, label: "Visualizzazioni video", unit: "count" },
    { key: `social.${id}.linkClicks`, label: "Clic sul link o sul profilo", unit: "count" },
  ],
});

export const METRIC_CATALOG: CatalogGroup[] = [
  {
    id: "web",
    label: "Sito web",
    metrics: [
      { key: "web.visits", label: "Visite al sito", unit: "count" },
      { key: "web.users", label: "Visitatori unici", unit: "count" },
      { key: "web.pageviews", label: "Pagine viste", unit: "count" },
      { key: "web.bounce", label: "Frequenza di rimbalzo", unit: "percent" },
      { key: "web.duration", label: "Durata media della visita", unit: "seconds" },
      { key: "web.leads", label: "Contatti ricevuti dal sito", unit: "count" },
      { key: "web.organic", label: "Visite da ricerca organica", unit: "count" },
      { key: "web.searchClicks", label: "Clic da Google", unit: "count" },
      { key: "web.searchImpressions", label: "Impression su Google", unit: "count" },
      { key: "web.avgPosition", label: "Posizione media su Google", unit: "decimal" },
    ],
  },
  ...PLATFORMS.map(([id, name]) => social(id, name)),
  {
    id: "ads",
    label: "Pubblicità online",
    metrics: [
      { key: "ads.spend", label: "Spesa pubblicitaria", unit: "eur" },
      { key: "ads.impressions", label: "Impression", unit: "count" },
      { key: "ads.clicks", label: "Clic", unit: "count" },
      { key: "ads.ctr", label: "Percentuale di clic (CTR)", unit: "percent" },
      { key: "ads.conversions", label: "Risultati ottenuti (conversioni)", unit: "count" },
      { key: "ads.cpa", label: "Costo per risultato", unit: "eur" },
      { key: "ads.roas", label: "Ritorno sulla spesa (ROAS)", unit: "decimal" },
    ],
  },
  {
    id: "email",
    label: "Email marketing",
    metrics: [
      { key: "email.sent", label: "Email inviate", unit: "count" },
      { key: "email.openRate", label: "Percentuale di aperture", unit: "percent" },
      { key: "email.clickRate", label: "Percentuale di clic", unit: "percent" },
      { key: "email.subscribers", label: "Iscritti totali", unit: "count" },
    ],
  },
  {
    id: "events",
    label: "Eventi, foto e video",
    metrics: [
      { key: "events.events", label: "Eventi realizzati", unit: "count" },
      { key: "events.photos", label: "Foto consegnate", unit: "count" },
      { key: "events.videos", label: "Video consegnati", unit: "count" },
      { key: "events.hours", label: "Ore di ripresa", unit: "decimal" },
    ],
  },
  {
    id: "software",
    label: "Sviluppo software",
    metrics: [
      { key: "software.releases", label: "Rilasci pubblicati", unit: "count" },
      { key: "software.tickets", label: "Richieste risolte", unit: "count" },
      { key: "software.hours", label: "Ore di sviluppo", unit: "decimal" },
      { key: "software.uptime", label: "Disponibilità del servizio (uptime)", unit: "percent" },
    ],
  },
  {
    id: "business",
    label: "Risultati per la tua attività",
    metrics: [
      { key: "business.leads", label: "Nuovi contatti generati", unit: "count" },
      { key: "business.sales", label: "Vendite generate", unit: "count" },
      { key: "business.revenue", label: "Ricavi generati", unit: "eur" },
    ],
  },
];

const CATALOG_BY_KEY = new Map(METRIC_CATALOG.flatMap((g) => g.metrics).map((m) => [m.key, m]));
export const UNITS: MetricUnit[] = ["count", "percent", "eur", "seconds", "decimal"];
export const UNIT_LABEL: Record<MetricUnit, string> = { count: "Numero", percent: "Percentuale", eur: "Euro", seconds: "Durata (secondi)", decimal: "Numero decimale" };

export const MAX_METRICS = 200;
const MAX_ABS = 1e12;

export type Metric = { key: string; label: string; unit: MetricUnit; value: number; note?: string };

export function catalogMetric(key: string): CatalogMetric | undefined {
  return CATALOG_BY_KEY.get(key);
}

/** Controlla e ripulisce le metriche: etichetta e unita' delle voci del catalogo non si possono falsificare. */
export function cleanMetrics(raw: { key: string; label?: string; unit?: string; value: number; note?: string }[]): Metric[] {
  if (raw.length > MAX_METRICS) invalid("metriche", `Massimo ${MAX_METRICS} metriche per report.`);
  const seen = new Set<string>();
  return raw.map((m) => {
    if (seen.has(m.key)) invalid("metriche", "Metrica ripetuta.");
    seen.add(m.key);
    if (!Number.isFinite(m.value) || Math.abs(m.value) > MAX_ABS) invalid("metriche", "Valore non valido.");
    const note = m.note === undefined || m.note.trim() === "" ? undefined : cleanText(m.note, { field: "nota della metrica", max: 200 });
    const known = CATALOG_BY_KEY.get(m.key);
    if (known) return { key: known.key, label: known.label, unit: known.unit, value: m.value, ...(note ? { note } : {}) };
    if (!/^custom\.[a-z0-9-]{1,40}$/.test(m.key)) invalid("metriche", "Metrica sconosciuta.");
    if (!m.unit || !UNITS.includes(m.unit as MetricUnit)) invalid("metriche", "Unità non valida.");
    return { key: m.key, label: cleanText(m.label ?? "", { field: "nome della metrica", min: 1, max: 80 }), unit: m.unit as MetricUnit, value: m.value, ...(note ? { note } : {}) };
  });
}

const nf = (max: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: max });

export function formatMetricValue(value: number, unit: MetricUnit): string {
  switch (unit) {
    case "count":
      return nf(0).format(Math.round(value));
    case "percent":
      return `${nf(1).format(value)}%`;
    case "eur":
      return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
    case "decimal":
      return nf(2).format(value);
    case "seconds": {
      const s = Math.max(0, Math.round(value));
      const m = Math.floor(s / 60);
      return m === 0 ? `${s} s` : `${m} min ${String(s % 60).padStart(2, "0")} s`;
    }
  }
}

/** Variazione rispetto al mese prima: in punti per le percentuali, in % per gli altri. `null` se manca il confronto. */
export function metricDelta(current: number, previous: number | undefined, unit: MetricUnit): { text: string; direction: "up" | "down" | "flat" } | null {
  if (previous === undefined) return null;
  if (unit === "percent") {
    const d = Math.round((current - previous) * 10) / 10;
    return { text: `${d > 0 ? "+" : ""}${nf(1).format(d)} punti`, direction: d > 0 ? "up" : d < 0 ? "down" : "flat" };
  }
  if (previous === 0) return current === 0 ? { text: "invariato", direction: "flat" } : null;
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
  return { text: `${pct > 0 ? "+" : ""}${nf(1).format(pct)}%`, direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}

/** Raggruppa le metriche nell'ordine del catalogo; le personalizzate vanno in fondo. */
export function groupMetrics<T extends { key: string }>(metrics: T[]): { id: string; label: string; metrics: T[] }[] {
  const out: { id: string; label: string; metrics: T[] }[] = [];
  for (const g of METRIC_CATALOG) {
    const items = g.metrics.flatMap((c) => metrics.filter((m) => m.key === c.key));
    if (items.length > 0) out.push({ id: g.id, label: g.label, metrics: items });
  }
  const custom = metrics.filter((m) => m.key.startsWith("custom."));
  if (custom.length > 0) out.push({ id: "custom", label: "Altre metriche", metrics: custom });
  return out;
}

/** Il mese e' sempre il primo giorno alle 00:00 UTC. */
export function isMonthStart(ms: number): boolean {
  const d = new Date(ms);
  return Number.isFinite(ms) && d.getUTCDate() === 1 && d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
}

const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export function monthLabel(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Abbina nome e valore di una tabella (es. letta da Excel) al catalogo; quello che non corrisponde resta fuori. */
export function matchSheetRows(rows: string[][]): { matched: { key: string; value: number }[]; unmatched: string[] } {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const byLabel = new Map<string, string[]>();
  for (const g of METRIC_CATALOG) for (const m of g.metrics) byLabel.set(norm(m.label), [...(byLabel.get(norm(m.label)) ?? []), m.key]);
  const num = (s: string): number | null => {
    const t = s.replace(/[€%\s]/g, "");
    if (t === "") return null;
    // Italiano: 1.520 = milleCinquecentoVenti; 12,5 = dodici virgola cinque; 1.520,5 entrambi.
    const n = Number(t.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t);
    return Number.isFinite(n) ? n : null;
  };
  const matched: { key: string; value: number }[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const [name, raw] = [row[0] ?? "", row[1] ?? ""];
    const value = num(raw);
    if (name.trim() === "" || value === null) continue;
    const parts = norm(name);
    // "Instagram Follower totali" -> si prova col nome della piattaforma davanti
    let keys = byLabel.get(parts);
    if (!keys) {
      for (const [pid, pname] of PLATFORMS) {
        const prefix = norm(pname);
        if (parts.startsWith(`${prefix} `)) {
          const k = byLabel.get(parts.slice(prefix.length + 1))?.find((x) => x.startsWith(`social.${pid}.`));
          if (k) keys = [k];
        }
      }
    }
    const key = keys && keys.length === 1 ? keys[0] : undefined;
    if (key && !seen.has(key)) {
      seen.add(key);
      matched.push({ key, value });
    } else unmatched.push(name.trim());
  }
  return { matched, unmatched };
}
