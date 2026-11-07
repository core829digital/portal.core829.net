import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import {
  collectedByMonth,
  collectedInMonth,
  collectedInYear,
  collectedTotal,
  DAY,
  monthlyRecurringCents,
  outstandingCents,
  overdue,
  upcomingRenewals,
  yearStart,
} from "./lib/metrics";
import { assertTimestamp } from "./lib/text";
import { invoiceStatus, projectStatus, subscriptionStatus } from "./lib/validators";

/**
 * Dashboard dell'amministratore. Solo lettura, solo per admin (`requireAdmin`).
 * Le query di Convex non leggono l'orologio: l'ora (`nowMs`) arriva dal browser e serve solo a
 * scegliere la finestra dei mesi/anno da mostrare; non da' alcun accesso in piu'.
 * Elenchi limitati da tetti fissi: se un tetto viene raggiunto lo si dichiara (`truncated`).
 */

const MAX_INVOICES = 3000;
const MAX_ROWS = 1000;

type ClientNames = Map<Id<"clients">, string>;

async function clientNames(ctx: { db: { query: (t: "clients") => { take: (n: number) => Promise<Doc<"clients">[]> } } }): Promise<{
  names: ClientNames;
  total: number;
  active: number;
  truncated: boolean;
}> {
  const clients = await ctx.db.query("clients").take(MAX_ROWS + 1);
  const rows = clients.slice(0, MAX_ROWS);
  return {
    names: new Map(rows.map((c) => [c._id, c.displayName])),
    total: rows.length,
    active: rows.filter((c) => c.status === "active").length,
    truncated: clients.length > MAX_ROWS,
  };
}

export const overview = query({
  args: { nowMs: v.number() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const nowMs = assertTimestamp(args.nowMs, "ora");

    const { names, total: totalClients, active: activeClients, truncated: clientsTruncated } = await clientNames(ctx);
    const invoiceRows = await ctx.db.query("invoices").order("desc").take(MAX_INVOICES + 1);
    const invoices = invoiceRows.slice(0, MAX_INVOICES);
    const subscriptions = (await ctx.db.query("subscriptions").take(MAX_ROWS + 1)).slice(0, MAX_ROWS);
    const projects = (await ctx.db.query("projects").take(MAX_ROWS + 1)).slice(0, MAX_ROWS);

    const monthStartNow = Date.UTC(new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth(), 1);
    const prevMonthStart = Date.UTC(new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth() - 1, 1);

    const od = overdue(invoices);
    const mrr = monthlyRecurringCents(subscriptions);
    const renewals = upcomingRenewals(subscriptions, nowMs, 30);

    // Incassato dell'anno per cliente (i primi 5).
    const from = yearStart(nowMs);
    const perClient = new Map<Id<"clients">, number>();
    for (const i of invoices) {
      if (i.status === "paid" && typeof i.paidAt === "number" && i.paidAt >= from && i.paidAt <= nowMs + DAY) {
        perClient.set(i.clientId, (perClient.get(i.clientId) ?? 0) + i.amountCents);
      }
    }
    const topClients = [...perClient.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([clientId, cents]) => ({ clientId, name: names.get(clientId) ?? "Cliente", cents }));

    // Fatture per stato (conteggio e importo).
    const byStatus = { paid: { count: 0, cents: 0 }, sent: { count: 0, cents: 0 }, overdue: { count: 0, cents: 0 }, draft: { count: 0, cents: 0 } };
    for (const i of invoices) {
      // Difesa: uno stato imprevisto (dati vecchi o importati) non deve far fallire tutta la dashboard.
      const bucket = (byStatus as Record<string, { count: number; cents: number } | undefined>)[i.status];
      if (!bucket) continue;
      bucket.count++;
      bucket.cents += i.amountCents;
    }

    // Prossime scadenze: fatture da incassare e rinnovi, in ordine di data.
    const upcoming = [
      ...invoices
        .filter((i) => i.status === "sent" || i.status === "overdue")
        .map((i) => ({
          kind: "invoice" as const,
          id: i._id as string,
          label: `Fattura ${i.number}`,
          clientId: i.clientId,
          clientName: names.get(i.clientId) ?? "Cliente",
          at: i.dueAt,
          amountCents: i.amountCents,
          overdue: i.status === "overdue",
        })),
      ...subscriptions
        .filter((s) => s.status === "active" && typeof s.nextRenewalAt === "number")
        .map((s) => ({
          kind: "renewal" as const,
          id: s._id as string,
          label: s.name,
          clientId: s.clientId,
          clientName: names.get(s.clientId) ?? "Cliente",
          at: s.nextRenewalAt as number,
          amountCents: s.amountCents,
          overdue: false,
        })),
    ]
      .sort((a, b) => a.at - b.at)
      .slice(0, 8);

    return {
      kpis: {
        collectedYearCents: collectedInYear(invoices, nowMs),
        collectedTotalCents: collectedTotal(invoices),
        collectedThisMonthCents: collectedInMonth(invoices, monthStartNow),
        collectedLastMonthCents: collectedInMonth(invoices, prevMonthStart),
        outstandingCents: outstandingCents(invoices),
        overdueCents: od.cents,
        overdueCount: od.count,
        mrrCents: mrr,
        arrCents: mrr * 12,
        activeClients,
        totalClients,
        openProjects: projects.filter((p) => p.status === "in_progress" || p.status === "in_review").length,
        completedProjects: projects.filter((p) => p.status === "completed").length,
        renewals30dCount: renewals.count,
        renewals30dCents: renewals.cents,
      },
      revenueByMonth: collectedByMonth(invoices, nowMs, 12),
      topClients,
      invoicesByStatus: byStatus,
      upcoming,
      truncated: invoiceRows.length > MAX_INVOICES || clientsTruncated,
    };
  },
});

export const invoices = query({
  args: { status: v.optional(invoiceStatus) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const { names } = await clientNames(ctx);
    const rows =
      args.status === undefined
        ? await ctx.db.query("invoices").order("desc").take(300)
        : await ctx.db
            .query("invoices")
            .withIndex("by_status_and_dueAt", (q) => q.eq("status", args.status as Doc<"invoices">["status"]))
            .order("desc")
            .take(300);
    return rows.map((i) => ({
      id: i._id,
      clientId: i.clientId,
      clientName: names.get(i.clientId) ?? "Cliente",
      number: i.number,
      issuedAt: i.issuedAt,
      dueAt: i.dueAt,
      paidAt: i.paidAt ?? null,
      amountCents: i.amountCents,
      status: i.status,
      note: i.note ?? null,
    }));
  },
});

export const subscriptions = query({
  args: { status: v.optional(subscriptionStatus) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const { names } = await clientNames(ctx);
    const rows =
      args.status === undefined
        ? await ctx.db.query("subscriptions").order("desc").take(300)
        : await ctx.db
            .query("subscriptions")
            .withIndex("by_status_and_nextRenewalAt", (q) => q.eq("status", args.status as Doc<"subscriptions">["status"]))
            .take(300);
    return rows.map((s) => ({
      id: s._id,
      clientId: s.clientId,
      clientName: names.get(s.clientId) ?? "Cliente",
      name: s.name,
      amountCents: s.amountCents,
      interval: s.interval,
      status: s.status,
      startedAt: s.startedAt,
      nextRenewalAt: s.nextRenewalAt ?? null,
      reminderDaysBefore: s.reminderDaysBefore ?? null,
    }));
  },
});

export const projects = query({
  args: { status: v.optional(projectStatus) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const { names } = await clientNames(ctx);
    const rows = await ctx.db.query("projects").order("desc").take(300);
    return rows
      .filter((p) => args.status === undefined || p.status === args.status)
      .map((p) => ({
        id: p._id,
        clientId: p.clientId,
        clientName: names.get(p.clientId) ?? "Cliente",
        name: p.name,
        status: p.status,
        progress: p.progress,
        dueDate: p.dueDate ?? null,
      }));
  },
});

/** Ultime attivita' dal registro di audit (solo azione, risorsa e data: mai segreti, il registro non ne contiene). */
export const activity = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const { names } = await clientNames(ctx);
    const rows = await ctx.db.query("auditLogs").order("desc").take(60);
    return rows.map((r) => ({
      id: r._id,
      at: r._creationTime,
      actorType: r.actorType,
      action: r.action,
      clientName: r.clientId ? (names.get(r.clientId) ?? null) : null,
    }));
  },
});
