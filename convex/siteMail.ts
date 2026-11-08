import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import { brandedEmail, DEFAULT_CLIENTS_FROM, OFFICIAL_EMAIL, REPLY_NOTE } from "./lib/mailFrame";
import { sendEmail } from "./lib/resend";

/**
 * Invia la risposta a una richiesta del sito. Mittente: clients@core829.net (CLIENTS_EMAIL_FROM).
 * L'email avverte che quell'indirizzo non e' presidiato e indica quello ufficiale del footer di core829.net;
 * "Rispondi" in ogni caso arriva li (Reply-To) e una copia nascosta resta nella casella ufficiale.
 */
export const deliver = internalAction({
  args: { replyId: v.id("siteReplies") },
  handler: async (ctx, args): Promise<null> => {
    const reply = await ctx.runQuery(internal.site.replyForDelivery, args);
    if (!reply) return null;
    if (!env.RESEND_API_KEY) {
      await ctx.runMutation(internal.site.replyResult, { replyId: args.replyId, ok: false });
      return null;
    }
    const { html, text } = brandedEmail({ bodyText: reply.body, note: REPLY_NOTE });
    try {
      await sendEmail(env.RESEND_API_KEY, {
        from: env.CLIENTS_EMAIL_FROM || DEFAULT_CLIENTS_FROM,
        to: reply.to,
        subject: reply.subject,
        text,
        html,
        replyTo: OFFICIAL_EMAIL,
        bcc: OFFICIAL_EMAIL,
      });
      await ctx.runMutation(internal.site.replyResult, { replyId: args.replyId, ok: true });
    } catch {
      await ctx.runMutation(internal.site.replyResult, { replyId: args.replyId, ok: false });
    }
    return null;
  },
});
