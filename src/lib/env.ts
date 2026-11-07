import { z } from "zod";

/**
 * Variabili d'ambiente pubbliche (visibili nel browser), validate una volta sola.
 * Non lancia errori all'import (cosi' la build in CI non si rompe): chi le usa chiama `getClientEnv()`.
 * Segreti veri (chiavi API) NON vanno mai in variabili NEXT_PUBLIC_*.
 */

const httpsOrLocalhost = z
  .string()
  .url()
  .refine((value) => {
    const u = new URL(value);
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  }, "Deve essere un URL https (http solo per localhost).");

const clientEnvSchema = z.object({
  NEXT_PUBLIC_CONVEX_URL: httpsOrLocalhost,
  NEXT_PUBLIC_APP_URL: httpsOrLocalhost,
  /** Solo con un dominio personalizzato per le richieste HTTP di Convex. */
  NEXT_PUBLIC_CONVEX_SITE_URL: httpsOrLocalhost.optional(),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

let cached: ClientEnv | undefined;

export function getClientEnv(): ClientEnv {
  if (cached) return cached;
  // Accesso letterale: Next.js sostituisce `process.env.NEXT_PUBLIC_*` solo in questa forma.
  const parsed = clientEnvSchema.safeParse({
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CONVEX_SITE_URL: process.env.NEXT_PUBLIC_CONVEX_SITE_URL || undefined,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configurazione non valida o mancante: ${fields}. Vedi .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
