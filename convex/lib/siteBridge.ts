import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { invalid } from "./text";

/**
 * Ponte verso il database di Andromedia Web (un altro deployment Convex). Funzioni senza accesso al database del portale.
 *  - L'indirizzo deve essere https e finire in .convex.cloud (nessun altro server raggiungibile da qui).
 *  - Le scritture portano la "guardia": SHA-256 del segreto condiviso, calcolata qui (il segreto non lascia mai il server).
 */

export const SITE_SETTING_KEYS = ["global", "seo:default", "seo:home", "seo:servizi", "seo:portfolio", "seo:chi-siamo", "seo:contatti", "seo:blog", "content:home", "content:faq"] as const;
export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[number];

export function isSiteSettingKey(k: string): k is SiteSettingKey {
  return (SITE_SETTING_KEYS as readonly string[]).includes(k);
}

export function checkBridgeUrl(raw: string | undefined): string {
  if (!raw) return invalid("ponte", "Collegamento a Andromedia Web non configurato: imposta AW_CONVEX_URL e AW_CONVEX_GUARD su Convex.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return invalid("ponte", "AW_CONVEX_URL non è un indirizzo valido.");
  }
  if (url.protocol !== "https:" || !/\.convex\.cloud$/.test(url.hostname)) return invalid("ponte", "AW_CONVEX_URL deve essere un indirizzo https://….convex.cloud.");
  return url.origin;
}

export async function guardDigest(secret: string | undefined): Promise<string> {
  if (!secret) return invalid("ponte", "Manca AW_CONVEX_GUARD (il segreto condiviso con Andromedia Web).");
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type Bridge = {
  query: <T>(name: string, args?: Record<string, unknown>) => Promise<T>;
  mutate: <T>(name: string, args?: Record<string, unknown>) => Promise<T>;
};

function friendly(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (/firma di sicurezza/i.test(message)) return invalid("ponte", "Andromedia Web ha rifiutato la firma: AW_CONVEX_GUARD qui e sul sito non coincidono.");
  const clean = message.split("\n").find((l) => /Uncaught Error:|Error:/.test(l))?.replace(/^.*Error:\s*/, "").trim();
  return invalid("ponte", clean && clean.length < 200 ? clean : "Andromedia Web non ha risposto. Riprova tra poco.");
}

export async function openBridge(env: { AW_CONVEX_URL?: string; AW_CONVEX_GUARD?: string }): Promise<Bridge> {
  const client = new ConvexHttpClient(checkBridgeUrl(env.AW_CONVEX_URL));
  const guard = await guardDigest(env.AW_CONVEX_GUARD);
  return {
    query: async <T,>(name: string, args: Record<string, unknown> = {}) => {
      try {
        return (await client.query(makeFunctionReference<"query">(name), args)) as T;
      } catch (e) {
        return friendly(e);
      }
    },
    mutate: async <T,>(name: string, args: Record<string, unknown> = {}) => {
      try {
        return (await client.mutation(makeFunctionReference<"mutation">(name), { ...args, guard })) as T;
      } catch (e) {
        return friendly(e);
      }
    },
  };
}
