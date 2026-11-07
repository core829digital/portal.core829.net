import { assertIntInRange, cleanHttpsUrl, cleanText, invalid } from "./text";

/**
 * Widget: i blocchi con cui si compone la pagina di ogni cliente.
 *
 * I blocchi "di sistema" mostrano dati veri (progetti, fatture...) e non hanno testo da configurare.
 * I blocchi "liberi" (avviso, link utili, contatti) contengono testo scritto dall'amministratore:
 * e' solo testo semplice, validato qui e mostrato sempre con l'escape di React (mai come HTML).
 */

export const CORE_WIDGET_TYPES = ["welcome", "onboarding", "summary", "projects", "billing", "subscriptions", "documents"] as const;
export const FREE_WIDGET_TYPES = ["notice", "links", "contact"] as const;

export type CoreWidgetType = (typeof CORE_WIDGET_TYPES)[number];
export type FreeWidgetType = (typeof FREE_WIDGET_TYPES)[number];
export type WidgetType = CoreWidgetType | FreeWidgetType;

export type LinkItem = { label: string; url: string };

export type Widget =
  | { id: string; type: CoreWidgetType; enabled: boolean }
  | { id: string; type: "notice"; enabled: boolean; title: string; body: string }
  | { id: string; type: "links"; enabled: boolean; title: string; items: LinkItem[] }
  | { id: string; type: "contact"; enabled: boolean; title: string; body: string };

export const WIDGET_LABEL: Record<WidgetType, string> = {
  welcome: "Benvenuto",
  onboarding: "Introduzione",
  summary: "Riepilogo",
  projects: "Progetti",
  billing: "Fatture e pagamenti",
  subscriptions: "Abbonamenti",
  documents: "Contratti e documenti",
  notice: "Avviso",
  links: "Link utili",
  contact: "Contatti",
};

export const MAX_WIDGETS = 20;
export const MAX_LINKS = 10;

/** Pagina predefinita, usata finche' non se ne salva una personalizzata. */
export function defaultLayout(): Widget[] {
  return CORE_WIDGET_TYPES.map((type) => ({ id: type, type, enabled: true }));
}

const ID_RE = /^[a-z0-9-]{1,40}$/;

/**
 * Controlla e ripulisce l'elenco dei widget. Restituisce una copia "pulita": i campi sconosciuti
 * vengono scartati, i testi normalizzati, gli URL ammessi solo se https.
 */
export function normalizeWidgets(raw: Widget[]): Widget[] {
  if (raw.length > MAX_WIDGETS) invalid("pagina", `Massimo ${MAX_WIDGETS} blocchi.`);
  const seenIds = new Set<string>();
  const seenCore = new Set<string>();
  const out: Widget[] = [];

  for (const w of raw) {
    if (!ID_RE.test(w.id)) invalid("pagina", "Identificativo del blocco non valido.");
    if (seenIds.has(w.id)) invalid("pagina", "Identificativi duplicati.");
    seenIds.add(w.id);

    if (w.type === "notice") {
      out.push({
        id: w.id,
        type: "notice",
        enabled: w.enabled,
        title: cleanText(w.title, { field: "titolo dell'avviso", min: 1, max: 80 }),
        body: cleanText(w.body, { field: "testo dell'avviso", min: 1, max: 2000, multiline: true }),
      });
    } else if (w.type === "contact") {
      out.push({
        id: w.id,
        type: "contact",
        enabled: w.enabled,
        title: cleanText(w.title, { field: "titolo dei contatti", min: 1, max: 80 }),
        body: cleanText(w.body, { field: "testo dei contatti", min: 1, max: 1000, multiline: true }),
      });
    } else if (w.type === "links") {
      assertIntInRange(w.items.length, 1, MAX_LINKS, "numero di link");
      out.push({
        id: w.id,
        type: "links",
        enabled: w.enabled,
        title: cleanText(w.title, { field: "titolo dei link", min: 1, max: 80 }),
        items: w.items.map((item) => ({
          label: cleanText(item.label, { field: "nome del link", min: 1, max: 60 }),
          url: cleanHttpsUrl(item.url, "indirizzo del link"),
        })),
      });
    } else {
      // Blocco di sistema: al massimo uno per tipo.
      if (seenCore.has(w.type)) invalid("pagina", `Il blocco «${WIDGET_LABEL[w.type]}» puo' comparire una volta sola.`);
      seenCore.add(w.type);
      out.push({ id: w.id, type: w.type, enabled: w.enabled });
    }
  }
  return out;
}
