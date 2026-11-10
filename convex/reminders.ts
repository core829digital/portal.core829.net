import { internalMutation } from "./_generated/server";
import { advanceRenewal, DAY_MS } from "./lib/reminders";

const BATCH = 100;

/**
 * Lavoro periodico (vedi crons.ts): porta avanti la data di rinnovo degli abbonamenti attivi quando e' passata.
 * Le email di promemoria NON partono da qui: l'unico promemoria ai clienti e' quello delle 10:30 del giorno prima
 * (convex/paymentReminders.ts). Le query non leggono l'orologio, quindi l'avanzamento avviene qui.
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ advanced: number }> => {
    const now = Date.now();
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
    return { advanced };
  },
});
