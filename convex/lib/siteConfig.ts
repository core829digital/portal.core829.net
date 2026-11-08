import { cleanText, invalid } from "./text";

/** Pagine e lingue del sito core829.net (devono restare allineate a core829.net-new: i18n/routing.ts e app/[locale]). */
export const SITE_PAGES = [
  { key: "home", label: "Home", path: "" },
  { key: "servizi", label: "Servizi", path: "/servizi" },
  { key: "software-su-misura", label: "Software su misura", path: "/software-su-misura" },
  { key: "ai-per-aziende", label: "AI per aziende", path: "/ai-per-aziende" },
  { key: "metodo", label: "Metodo", path: "/metodo" },
  { key: "prezzi", label: "Prezzi", path: "/prezzi" },
  { key: "chi-siamo", label: "Chi siamo", path: "/chi-siamo" },
  { key: "careers", label: "Lavora con noi", path: "/careers" },
  { key: "contatti", label: "Contatti", path: "/contatti" },
] as const;

export const SITE_LOCALES = ["en", "it", "ro", "fr", "de", "nl", "es", "pt", "pl", "cs", "sk", "hu", "ru", "uk", "bg", "el", "tr", "sv", "da", "no", "fi", "zh", "ja", "ko"] as const;

export const isSitePage = (k: string): boolean => SITE_PAGES.some((p) => p.key === k);
export const isSiteLocale = (k: string): boolean => (SITE_LOCALES as readonly string[]).includes(k);

/** "*" = tutte le lingue senza un testo dedicato. */
export const ALL_LOCALES = "*";

export type SeoInput = { title?: string; description?: string; noindex?: boolean };

export function cleanSeo(page: string, locale: string, raw: SeoInput): { page: string; locale: string; title?: string; description?: string; noindex?: boolean } {
  if (!isSitePage(page)) invalid("pagina", "Pagina non valida.");
  if (locale !== ALL_LOCALES && !isSiteLocale(locale)) invalid("lingua", "Lingua non valida.");
  const title = raw.title?.trim() ? cleanText(raw.title, { field: "titolo", max: 120 }) : undefined;
  const description = raw.description?.trim() ? cleanText(raw.description, { field: "descrizione", max: 300 }) : undefined;
  return { page, locale, title, description, noindex: raw.noindex === true ? true : undefined };
}

export type Announcement = { enabled: boolean; text: string; href: string; cta: string };

export function cleanAnnouncement(raw: { enabled: boolean; text: string; href: string; cta: string }): Announcement {
  const text = raw.text.trim() === "" ? "" : cleanText(raw.text, { field: "testo dell'avviso", max: 160 });
  const cta = raw.cta.trim() === "" ? "" : cleanText(raw.cta, { field: "testo del pulsante", max: 40 });
  let href = raw.href.trim();
  if (href !== "") {
    // Solo indirizzi del sito (/qualcosa) o https: niente javascript:, data: o simili.
    if (!(/^\/(?!\/)[A-Za-z0-9\-_/#?=&.%]{0,200}$/.test(href) || /^https:\/\/[^\s"'<>]{1,300}$/.test(href))) invalid("indirizzo", "L'indirizzo deve iniziare con / (pagina del sito) oppure https://.");
    href = href.slice(0, 300);
  }
  if (raw.enabled && text === "") invalid("avviso", "Scrivi il testo dell'avviso prima di attivarlo.");
  return { enabled: raw.enabled, text, href, cta };
}

/** Percorso di una pagina come lo manda il tracker: "/it/prezzi" -> { locale: "it", path: "/prezzi" }. Altrimenti null. */
export function parseTrackedPath(raw: string): { locale: string; path: string } | null {
  if (raw.length > 120 || !/^\/[A-Za-z0-9\-_/]*$/.test(raw)) return null;
  const parts = raw.split("/").filter(Boolean);
  const locale = parts[0];
  if (!locale || !isSiteLocale(locale)) return null;
  const rest = parts.slice(1);
  const path = rest.length === 0 ? "/" : `/${rest.slice(0, 3).join("/")}`;
  return { locale, path };
}

export const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
