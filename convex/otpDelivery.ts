import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import { sendEmail } from "./lib/resend";
import { escapeHtml } from "./lib/text";

/**
 * Crea e spedisce il codice di sblocco al cliente.
 * Il codice in chiaro esiste solo qui, in memoria: non viene salvato ne' passato come argomento.
 */
export const deliver = internalAction({
  args: { linkId: v.id("accessLinks") },
  handler: async (ctx, args): Promise<null> => {
    if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) {
      console.error("Codice di sblocco non inviato: RESEND_API_KEY o AUTH_EMAIL_FROM mancanti.");
      return null;
    }
    let issued: { code: string; email: string; displayName: string };
    try {
      issued = await ctx.runMutation(internal.otp.issueCode, { linkId: args.linkId });
    } catch {
      // Limite raggiunto o link non piu' valido: nessun invio, nessun dettaglio.
      return null;
    }

    const name = escapeHtml(issued.displayName);
    const code = escapeHtml(issued.code);
    await sendEmail(env.RESEND_API_KEY, {
      from: env.AUTH_EMAIL_FROM,
      to: issued.email,
      subject: `Il tuo codice per vedere i documenti: ${issued.code}`,
      text: `Ciao, il tuo codice per vedere i documenti di ${issued.displayName} nel portale CORE829 è ${issued.code}.\n\nVale 10 minuti. Se non l'hai richiesto tu, ignora questa email: nessuno può vedere i tuoi documenti senza questo codice.`,
      html:
        `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111217">` +
        `<p style="font-size:13px;letter-spacing:2px;color:#b8132a;font-weight:bold;margin:0">CORE829</p>` +
        `<p style="font-size:16px;line-height:24px">Il tuo codice per vedere i documenti di <strong>${name}</strong>:</p>` +
        `<p style="font-size:32px;letter-spacing:6px;font-weight:bold;margin:16px 0">${code}</p>` +
        `<p style="font-size:14px;line-height:21px;color:#4a5160">Vale 10 minuti. Se non l'hai richiesto tu, ignora questa email: nessuno può vedere i tuoi documenti senza questo codice.</p>` +
        `</div>`,
    });
    return null;
  },
});
