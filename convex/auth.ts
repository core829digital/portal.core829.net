import { Email } from "@convex-dev/auth/providers/Email";
import { convexAuth } from "@convex-dev/auth/server";
import { env } from "./_generated/server";
import { isAllowedAdminEmail } from "./lib/adminEmails";
import { randomDigits } from "./lib/crypto";
import { sendEmail } from "./lib/resend";
import { escapeHtml } from "./lib/text";

/**
 * Accesso dell'amministratore: codice a 8 cifre inviato via email (Resend).
 *
 * Sicurezza:
 *  - il codice si spedisce SOLO agli indirizzi in ADMIN_EMAILS; per gli altri non succede nulla,
 *    ma la risposta e' identica (non si puo' scoprire chi e' amministratore);
 *  - il codice vale 10 minuti ed e' legato all'email usata (Convex Auth verifica che coincidano);
 *  - l'autorizzazione vera e' in `requireAdmin` (tabella `admins`): un utente senza riga li' non fa nulla;
 *  - sessione breve: 12 ore al massimo, 2 ore senza attivita'.
 */
const CODE_TTL_SECONDS = 10 * 60;

const ResendOtp = Email({
  id: "resend-otp",
  maxAge: CODE_TTL_SECONDS,
  async generateVerificationToken() {
    return randomDigits(8);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    if (!isAllowedAdminEmail(email, env.ADMIN_EMAILS)) return; // silenzio: stessa risposta per tutti
    if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) {
      throw new Error("Configurazione email mancante (RESEND_API_KEY, AUTH_EMAIL_FROM).");
    }
    const code = escapeHtml(token);
    await sendEmail(env.RESEND_API_KEY, {
      from: env.AUTH_EMAIL_FROM,
      to: email,
      subject: `Il tuo codice di accesso CORE829: ${token}`,
      text: `Il tuo codice di accesso al portale CORE829 è ${token}.\n\nVale 10 minuti. Se non l'hai richiesto tu, ignora questa email.`,
      html:
        `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111217">` +
        `<p style="font-size:13px;letter-spacing:2px;color:#b8132a;font-weight:bold;margin:0">CORE829</p>` +
        `<p style="font-size:16px;line-height:24px">Il tuo codice di accesso al portale è:</p>` +
        `<p style="font-size:32px;letter-spacing:6px;font-weight:bold;margin:16px 0">${code}</p>` +
        `<p style="font-size:14px;line-height:21px;color:#4a5160">Vale 10 minuti. Se non l'hai richiesto tu, ignora questa email.</p>` +
        `</div>`,
    });
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [ResendOtp],
  session: {
    totalDurationMs: 12 * 60 * 60 * 1000,
    inactiveDurationMs: 2 * 60 * 60 * 1000,
  },
  signIn: {
    // Tentativi di codice errati per account, in un'ora.
    maxFailedAttempsPerHour: 5,
  },
});
