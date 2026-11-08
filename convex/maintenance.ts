import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { audit } from "./lib/audit";
import { notify } from "./lib/notify";
import { formatDateIt, formatEuroIt } from "./lib/reminders";

const BATCH = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Lavori periodici (vedi crons.ts). Le query di Convex non leggono l'orologio, quindi scadenze e
 * pulizie vengono applicate qui, con scritture che invalidano subito le sottoscrizioni dei client.
 * Ogni lavoro tratta al massimo BATCH righe e si ripianifica se ne restano altre.
 */

/** Disattiva i link arrivati a scadenza. */
export const expireLinks = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ processed: number }> => {
    const now = Date.now();
    const due = await ctx.db
      .query("accessLinks")
      .withIndex("by_active_and_expiresAt", (q) => q.eq("active", true).lt("expiresAt", now))
      .take(BATCH);
    for (const link of due) {
      await ctx.db.patch("accessLinks", link._id, { active: false, revokedAt: now });
      await audit(ctx, {
        actorType: "system",
        clientId: link.clientId,
        action: "access_link.expired",
        resourceType: "accessLink",
        resourceId: link._id,
      });
    }
    if (due.length === BATCH) await ctx.scheduler.runAfter(0, internal.maintenance.expireLinks, {});
    return { processed: due.length };
  },
});

/** Cancella le sessioni di sblocco scadute e i codici scaduti da oltre un giorno. */
export const expireSessions = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ processed: number }> => {
    const now = Date.now();
    const sessions = await ctx.db
      .query("unlockSessions")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(BATCH);
    for (const s of sessions) await ctx.db.delete("unlockSessions", s._id);

    const codes = await ctx.db
      .query("otpCodes")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now - DAY_MS))
      .take(BATCH);
    for (const c of codes) await ctx.db.delete("otpCodes", c._id);

    if (sessions.length === BATCH || codes.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.maintenance.expireSessions, {});
    }
    return { processed: sessions.length + codes.length };
  },
});

/** Segna come scadute le fatture inviate e non pagate oltre la data di scadenza. */
export const markOverdueInvoices = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ processed: number }> => {
    const now = Date.now();
    const due = await ctx.db
      .query("invoices")
      .withIndex("by_status_and_dueAt", (q) => q.eq("status", "sent").lt("dueAt", now))
      .take(BATCH);
    for (const invoice of due) {
      await ctx.db.patch("invoices", invoice._id, { status: "overdue" });
      await audit(ctx, {
        actorType: "system",
        clientId: invoice.clientId,
        action: "invoice.marked_overdue",
        resourceType: "invoice",
        resourceId: invoice._id,
      });
      if (invoice.visibleToClient) {
        await notify(ctx, "invoice_overdue", {
          clientId: invoice.clientId,
          data: { number: invoice.number, amount: formatEuroIt(invoice.amountCents), due: formatDateIt(invoice.dueAt) },
          dedupeSubject: invoice._id,
        });
      }
    }
    if (due.length === BATCH) await ctx.scheduler.runAfter(0, internal.maintenance.markOverdueInvoices, {});
    return { processed: due.length };
  },
});

/** Respinge i documenti rimasti "in controllo" troppo a lungo (azione fallita o interrotta). */
export const expirePendingScans = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ processed: number }> => {
    const cutoff = Date.now() - 15 * 60 * 1000;
    const pending = await ctx.db
      .query("documents")
      .withIndex("by_scanStatus", (q) => q.eq("scanStatus", "pending"))
      .take(BATCH);
    let processed = 0;
    for (const document of pending) {
      if (document._creationTime > cutoff) continue;
      await ctx.storage.delete(document.storageId);
      await ctx.db.patch("documents", document._id, {
        scanStatus: "rejected",
        rejectReason: "Il controllo non si è completato. Riprova il caricamento.",
        visibleToClient: false,
      });
      processed++;
    }
    return { processed };
  },
});

/** Cancella gli eventi webhook vecchi: la finestra anti-replay e' di 5 minuti, ne teniamo 7 giorni. */
export const expireWebhookEvents = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ processed: number }> => {
    const cutoff = Date.now() - 7 * DAY_MS;
    const old = await ctx.db
      .query("webhookEvents")
      .withIndex("by_receivedAt", (q) => q.lt("receivedAt", cutoff))
      .take(BATCH);
    for (const event of old) await ctx.db.delete("webhookEvents", event._id);
    if (old.length === BATCH) await ctx.scheduler.runAfter(0, internal.maintenance.expireWebhookEvents, {});
    return { processed: old.length };
  },
});
