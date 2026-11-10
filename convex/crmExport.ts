import { query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

/**
 * Esporta clienti, progetti, fatture e abbonamenti nel formato che il CRM (b2b.core829.net, «Data → Import from portal») sa leggere.
 * Solo amministratori. Il file contiene dati personali dei clienti: non va mai salvato in un repository.
 * NB: nessuna nota interna (`internalNotes`) viene esportata.
 */
const MAX_CLIENTS = 1000;
const MAX_ROWS = 2000;

export const snapshot = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const clients = await ctx.db.query("clients").take(MAX_CLIENTS + 1);
    const projects = await ctx.db.query("projects").take(MAX_ROWS + 1);
    const invoices = await ctx.db.query("invoices").take(MAX_ROWS + 1);
    const subscriptions = await ctx.db.query("subscriptions").take(MAX_ROWS + 1);
    const truncated = clients.length > MAX_CLIENTS || projects.length > MAX_ROWS || invoices.length > MAX_ROWS || subscriptions.length > MAX_ROWS;

    const by = <T extends { clientId: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) m.set(r.clientId, [...(m.get(r.clientId) ?? []), r]);
      return m;
    };
    const p = by(projects);
    const i = by(invoices);
    const s = by(subscriptions);

    return {
      format: "core829-portal-export/1" as const,
      truncated,
      clients: clients.slice(0, MAX_CLIENTS).map((c) => ({
        ref: c._id as string,
        displayName: c.displayName,
        contactName: c.contactName,
        email: c.email,
        phone: c.phone,
        vatId: c.vatId,
        address: c.address,
        pec: c.pec,
        legalRep: c.legalRep,
        website: c.website,
        status: c.status,
        projects: (p.get(c._id) ?? []).map((x) => ({ ref: x._id as string, name: x.name, description: x.description, status: x.status, startDate: x.startDate, dueDate: x.dueDate })),
        invoices: (i.get(c._id) ?? []).map((x) => ({
          ref: x._id as string, number: x.number, amountCents: x.amountCents, status: x.status, projectRef: x.projectId as string | undefined, issuedAt: x.issuedAt, note: x.note,
        })),
        subscriptions: (s.get(c._id) ?? []).map((x) => ({ ref: x._id as string, name: x.name, description: x.description, amountCents: x.amountCents, interval: x.interval, status: x.status })),
      })),
    };
  },
});
