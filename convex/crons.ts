import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("scadenza link di accesso", { minutes: 10 }, internal.maintenance.expireLinks, {});
crons.interval("pulizia sessioni e codici scaduti", { minutes: 10 }, internal.maintenance.expireSessions, {});
crons.interval("fatture scadute", { hours: 1 }, internal.maintenance.markOverdueInvoices, {});

crons.interval("controlli dei file rimasti in sospeso", { minutes: 15 }, internal.maintenance.expirePendingScans, {});

crons.interval("pulizia eventi webhook", { hours: 6 }, internal.maintenance.expireWebhookEvents, {});

crons.interval("promemoria di rinnovo abbonamenti", { hours: 3 }, internal.reminders.run, {});

crons.interval("promemoria di scadenza (fatture e scadenziario)", { hours: 6 }, internal.deadlines.sendReminders, {});

// Ogni ora al minuto :30 (UTC e Roma hanno scarto di ore intere). La funzione spedisce solo dalle 10:30 alle 18:59 ORA DI ROMA,
// quindi vale sia con l'ora solare sia con quella legale. Vedi convex/paymentReminders.ts.
crons.cron("promemoria di pagamento del giorno prima (dalle 10:30 ora italiana)", "30 * * * *", internal.paymentReminders.runAuto, {});

export default crons;
