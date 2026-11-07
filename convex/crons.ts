import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("scadenza link di accesso", { minutes: 10 }, internal.maintenance.expireLinks, {});
crons.interval("pulizia sessioni e codici scaduti", { minutes: 10 }, internal.maintenance.expireSessions, {});
crons.interval("fatture scadute", { hours: 1 }, internal.maintenance.markOverdueInvoices, {});

export default crons;
