import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("scadenza link di accesso", { minutes: 10 }, internal.maintenance.expireLinks, {});
crons.interval("pulizia sessioni e codici scaduti", { minutes: 10 }, internal.maintenance.expireSessions, {});
crons.interval("fatture scadute", { hours: 1 }, internal.maintenance.markOverdueInvoices, {});

crons.interval("controlli dei file rimasti in sospeso", { minutes: 15 }, internal.maintenance.expirePendingScans, {});

crons.interval("pulizia eventi webhook", { hours: 6 }, internal.maintenance.expireWebhookEvents, {});

crons.interval("promemoria di rinnovo abbonamenti", { hours: 3 }, internal.reminders.run, {});

export default crons;
