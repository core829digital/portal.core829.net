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
    /** Indirizzo del sito web (es. https://portal.core829.net). Lo imposta anche Convex Auth; qui serve per il CORS dei download. */
    SITE_URL: v.optional(v.string()),
    /** Facoltativa: chiave API di VirusTotal per confrontare l'impronta (SHA-256) dei file con malware noti. Il file non viene mai inviato. */
    VIRUSTOTAL_API_KEY: v.optional(v.string()),
    /** Segreto di firma dei webhook di Resend (inizia con whsec_). SEGRETO. Senza, l'endpoint rifiuta tutto. */
    RESEND_WEBHOOK_SECRET: v.optional(v.string()),
    /** Segreto di firma (whsec_...) con cui b2b.core829.net firma le trattative inviate al portale. SEGRETO. Senza, l'endpoint rifiuta tutto. */
    B2B_WEBHOOK_SECRET: v.optional(v.string()),
    /** Segreto di firma (whsec_...) con cui il sito core829.net firma i messaggi del modulo contatti e le visite inviati al portale. SEGRETO. Senza, gli endpoint /site/* rifiutano tutto. */
    SITE_BRIDGE_SECRET: v.optional(v.string()),
    /** Mittente delle email ai clienti, es. "CORE829 <clients@core829.net>". Il dominio deve essere verificato in Resend. Se manca si usa quello indicato. */
    CLIENTS_EMAIL_FROM: v.optional(v.string()),
    /** Indirizzi (separati da virgola) che ricevono le notifiche per l'amministrazione. Se manca si usa ADMIN_EMAILS. */
    NOTIFY_ADMIN_EMAILS: v.optional(v.string()),
    /** Facoltativa: indirizzi IP (o intervalli CIDR) da cui accettare i webhook, separati da virgola. Vedi docs/SECURITY.md. */
    WEBHOOK_IP_ALLOWLIST: v.optional(v.string()),
  },
});

export default app;
