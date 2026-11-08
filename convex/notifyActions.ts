"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import { brandedEmail, DEFAULT_CLIENTS_FROM, OFFICIAL_EMAIL, REPLY_NOTE } from "./lib/mailFrame";
import { sendEmail } from "./lib/resend";

/**
 * Invia una notifica accodata da `notify()`.
 *  - verso i clienti: da clients@core829.net, "Rispondi" va a hello@core829.net, copia nascosta nella casella ufficiale;
 *  - verso l'amministrazione: dal mittente del portale (AUTH_EMAIL_FROM).
 */
export const deliver = internalAction({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args): Promise<null> => {
    const n = await ctx.runQuery(internal.notifications.forDelivery, args);
    if (!n) return null;
    const fail = (reason: string) => ctx.runMutation(internal.notifications.result, { notificationId: args.notificationId, ok: false, reason });
    const from = n.audience === "client" ? env.CLIENTS_EMAIL_FROM || DEFAULT_CLIENTS_FROM : env.AUTH_EMAIL_FROM;
    if (!env.RESEND_API_KEY || !from) {
      await fail("Servizio email non configurato (RESEND_API_KEY / mittente).");
      return null;
    }
    try {
      const base = (env.SITE_URL ?? "").replace(/\/+$/, "");
      const cta = n.ctaPath && n.ctaLabel && base ? { label: n.ctaLabel, url: `${base}${n.ctaPath}` } : undefined;
      const { html, text } = brandedEmail({ heading: n.heading, bodyText: n.body, cta, note: n.audience === "client" ? REPLY_NOTE : undefined });
      let attachments: { filename: string; content: string }[] | undefined;
      if (n.attachmentStorageId) {
        const blob = await ctx.storage.get(n.attachmentStorageId);
        if (blob) attachments = [{ filename: n.attachmentName ?? "documento.pdf", content: Buffer.from(await blob.arrayBuffer()).toString("base64") }];
      }
      await sendEmail(env.RESEND_API_KEY, {
        from,
        to: n.to,
        subject: n.subject,
        text,
        html,
        attachments,
        ...(n.audience === "client" ? { replyTo: OFFICIAL_EMAIL, bcc: OFFICIAL_EMAIL } : {}),
      });
      await ctx.runMutation(internal.notifications.result, { notificationId: args.notificationId, ok: true });
    } catch {
      await fail("Invio non riuscito: puoi riprovare dal centro notifiche.");
    }
    return null;
  },
});
