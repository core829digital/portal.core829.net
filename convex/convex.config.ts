import { defineApp } from "convex/server";
import { v } from "convex/values";

/**
 * Variabili d'ambiente del deployment (si impostano con `npx convex env set NOME valore`).
 * Sono tutte facoltative a livello di tipo: se mancano, il login dell'amministratore non parte.
 */
const app = defineApp({
  env: {
    /** Indirizzi autorizzati ad accedere come amministratore, separati da virgola. */
    ADMIN_EMAILS: v.optional(v.string()),
    /** Chiave API di Resend. SEGRETA: mai nel codice o in file committati. */
    RESEND_API_KEY: v.optional(v.string()),
    /** Mittente delle email, es. "CORE829 Portale <portal@core829.net>". Il dominio deve essere verificato su Resend. */
    AUTH_EMAIL_FROM: v.optional(v.string()),
  },
});

export default app;
