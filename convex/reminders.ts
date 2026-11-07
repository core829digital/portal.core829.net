import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { env, internalAction, internalMutation } from "./_generated/server";
import { parseAdminEmails } from "./lib/adminEmails";
import { audit } from "./lib/audit";
import {
  advanceRenewal,
  DAY_MS,
  formatDateIt,
  formatEuroIt,
  isReminderDue,
  MAX_REMINDER_DAYS,
} from "./lib/reminders";
import { sendEmail } from "./lib/resend";
import { escapeHtml } from "./lib/text";

const BATCH = 100;

/**
 * Lavoro periodico (vedi crons.ts):
 *  1. porta avanti la data di rinnovo degli abbonamenti attivi quando e' passata;
 *  2. pianifica l'invio dei promemoria in scadenza.
 * Le query non leggono l'orologio, quindi tutto avviene qui.
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ advanced: number; scheduled: number }> => {
    const now = Date.now();

    // 1. Rinnovi passati: si passa al ciclo successivo (e il promemoria potra' ripartire).
    const past = await ctx.db
      .query("subscriptions")
      .withIndex("by_status_and_nextRenewalAt", (q) => q.eq("status", "active").lt("nextRenewalAt", now - DAY_MS))
      .take(BATCH);
    let advanced = 0;
    for (const subscription of past) {
      if (subscription.nextRenewalAt === undefined) continue;
      const anchorDay = new Date(subscription.startedAt).getUTCDate();
      const next = advanceRenewal(subscription.nextRenewalAt, subscription.interval, now, anchorDay);
      if (next !== subscription.nextRenewalAt) {
        await ctx.db.patch("subscriptions", subscription._id, { nextRenewalAt: next });
        advanced++;
      }
    }

    // 2. Promemoria da inviare: rinnovi entro il massimo anticipo ammesso.
    const upcoming = await ctx.db
      .query("subscriptions")
      .withIndex("by_status_and_nextRenewalAt", (q) =>
        q.eq("status", "active").gte("nextRenewalAt", now - DAY_MS).lte("nextRenewalAt", now + MAX_REMINDER_DAYS * DAY_MS),
      )
      .take(BATCH);
    let scheduled = 0;
    for (const subscription of upcoming) {
      if (!isReminderDue(subscription, now)) continue;
      await ctx.scheduler.runAfter(0, internal.reminders.send, { subscriptionId: subscription._id });
      scheduled++;
    }
    return { advanced, scheduled };
  },
});

type Claimed = {
  clientId: Id<"clients">;
  clientEmail: string;
  clientName: string;
  subscriptionName: string;
  amountCents: number;
  renewalAt: number;
};

/**
 * "Prenota" l'invio: segna subito il rinnovo come gia' notificato, cosi' due esecuzioni ravvicinate non
 * possono spedire due volte. Se poi l'invio fallisce, `release` toglie il segno e il lavoro periodico riprova.
 */
export const claim = internalMutation({
  args: { subscriptionId: v.id("subscriptions") },
  handler: async (ctx, args): Promise<Claimed | null> => {
    const subscription = await ctx.db.get("subscriptions", args.subscriptionId);
    if (!subscription || subscription.status !== "active") return null;
    if (!isReminderDue(subscription, Date.now()) || subscription.nextRenewalAt === undefined) return null;
    const client = await ctx.db.get("clients", subscription.clientId);
    if (!client || client.status === "closed") return null;
    await ctx.db.patch("subscriptions", subscription._id, { lastReminderForRenewalAt: subscription.nextRenewalAt });
    return {
      clientId: client._id,
      clientEmail: client.email,
      clientName: client.displayName,
      subscriptionName: subscription.name,
      amountCents: subscription.amountCents,
      renewalAt: subscription.nextRenewalAt,
    };
  },
});

export const release = internalMutation({
  args: { subscriptionId: v.id("subscriptions"), renewalAt: v.number() },
  handler: async (ctx, args): Promise<null> => {
    const subscription = await ctx.db.get("subscriptions", args.subscriptionId);
    if (subscription && subscription.lastReminderForRenewalAt === args.renewalAt) {
      await ctx.db.patch("subscriptions", subscription._id, { lastReminderForRenewalAt: undefined });
    }
    return null;
  },
});

export const recordSent = internalMutation({
  args: { subscriptionId: v.id("subscriptions"), clientId: v.id("clients"), renewalAt: v.number(), adminNotified: v.boolean() },
  handler: async (ctx, args): Promise<null> => {
    await audit(ctx, {
      actorType: "system",
      clientId: args.clientId,
      action: "subscription.reminder_sent",
      resourceType: "subscription",
      resourceId: args.subscriptionId,
      metadata: { renewalAt: args.renewalAt, adminNotified: args.adminNotified },
    });
    return null;
  },
});

function layout(inner: string): string {
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937">` +
    `<p style="font-size:13px;letter-spacing:2px;color:#c2410c;font-weight:bold;margin:0">CORE829</p>` +
    inner +
    `</div>`
  );
}

/** Invia il promemoria al cliente e, dopo l'invio riuscito, la conferma agli amministratori. */
export const send = internalAction({
  args: { subscriptionId: v.id("subscriptions") },
  handler: async (ctx, args): Promise<null> => {
    if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) {
      console.error("Promemoria non inviato: RESEND_API_KEY o AUTH_EMAIL_FROM mancanti.");
      return null;
    }
    const claimed = await ctx.runMutation(internal.reminders.claim, { subscriptionId: args.subscriptionId });
    if (!claimed) return null;

    const amount = formatEuroIt(claimed.amountCents);
    const date = formatDateIt(claimed.renewalAt);
    try {
      await sendEmail(env.RESEND_API_KEY, {
        from: env.AUTH_EMAIL_FROM,
        to: claimed.clientEmail,
        subject: `Promemoria: pagamento di ${amount} in scadenza il ${date}`,
        text:
          `Buongiorno,\n\nun promemoria dal team CORE829: il pagamento di ${amount} per "${claimed.subscriptionName}" è in scadenza il ${date}.\n\n` +
          `Puoi consultare importi e documenti nel tuo portale clienti con il link personale che ti abbiamo inviato.\n\n` +
          `Se hai già provveduto, ignora questo messaggio. Per qualsiasi domanda rispondi a questa email.\n\nGrazie,\nCORE829 SRL`,
        html: layout(
          `<p style="font-size:16px;line-height:24px">Buongiorno,</p>` +
            `<p style="font-size:16px;line-height:24px">un promemoria dal team CORE829: il pagamento di <strong>${escapeHtml(amount)}</strong> per ` +
            `<strong>${escapeHtml(claimed.subscriptionName)}</strong> è in scadenza il <strong>${escapeHtml(date)}</strong>.</p>` +
            `<p style="font-size:14px;line-height:21px;color:#6b7280">Puoi consultare importi e documenti nel tuo portale clienti con il link personale che ti abbiamo inviato. ` +
            `Se hai già provveduto, ignora questo messaggio. Per qualsiasi domanda rispondi a questa email.</p>` +
            `<p style="font-size:14px;line-height:21px;color:#6b7280">Grazie,<br/>CORE829 SRL</p>`,
        ),
      });
    } catch {
      console.error("Promemoria al cliente non inviato: si riprova al prossimo ciclo.");
      await ctx.runMutation(internal.reminders.release, { subscriptionId: args.subscriptionId, renewalAt: claimed.renewalAt });
      return null;
    }

    // Conferma agli amministratori: un errore qui non annulla il promemoria gia' consegnato.
    let adminNotified = false;
    const admins = parseAdminEmails(env.ADMIN_EMAILS);
    if (admins.length > 0) {
      try {
        for (const admin of admins) {
          await sendEmail(env.RESEND_API_KEY, {
            from: env.AUTH_EMAIL_FROM,
            to: admin,
            subject: `Promemoria inviato a ${claimed.clientName}`,
            text:
              `Il promemoria è stato inviato a ${claimed.clientName} (${claimed.clientEmail}).\n` +
              `Abbonamento: ${claimed.subscriptionName}\nImporto: ${amount}\nScadenza: ${date}`,
            html: layout(
              `<p style="font-size:16px;line-height:24px">Promemoria inviato a <strong>${escapeHtml(claimed.clientName)}</strong> (${escapeHtml(claimed.clientEmail)}).</p>` +
                `<p style="font-size:14px;line-height:22px;color:#374151">Abbonamento: ${escapeHtml(claimed.subscriptionName)}<br/>` +
                `Importo: ${escapeHtml(amount)}<br/>Scadenza: ${escapeHtml(date)}</p>`,
            ),
          });
        }
        adminNotified = true;
      } catch {
        console.error("Conferma agli amministratori non inviata (il promemoria al cliente è partito).");
      }
    }
    await ctx.runMutation(internal.reminders.recordSent, {
      subscriptionId: args.subscriptionId,
      clientId: claimed.clientId,
      renewalAt: claimed.renewalAt,
      adminNotified,
    });
    return null;
  },
});
