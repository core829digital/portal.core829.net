import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { monthlyRecurringCents } from "./metrics";

/** Primo giorno del mese successivo / precedente (UTC). */
export const addMonths = (monthMs: number, n: number): number => {
  const d = new Date(monthMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
};

export type ReportView = {
  month: number;
  status: "draft" | "published";
  publishedAt: number | null;
  summary: string | null;
  nextSteps: string | null;
  metrics: { key: string; label: string; unit: Doc<"clientReports">["metrics"][number]["unit"]; value: number; note: string | null; previous: number | null }[];
  /** Numeri calcolati dai dati del portale nel mese, uguali per admin e cliente. */
  auto: {
    paidCents: number;
    paidCount: number;
    invoicesIssued: number;
    projectUpdates: number;
    documentsDelivered: number;
    activeSubscriptions: number;
    monthlyRecurringCents: number;
  };
};

/**
 * Il report di un mese come lo vede chi legge: metriche con il valore del mese prima (per il confronto) e numeri
 * calcolati dal portale. Il cliente vede solo fatture/documenti/aggiornamenti a lui visibili: stesse regole di `buildOverview`.
 */
export async function buildReportView(ctx: QueryCtx, clientId: Id<"clients">, month: number, opts: { onlyPublished: boolean }): Promise<ReportView | null> {
  const report = await ctx.db
    .query("clientReports")
    .withIndex("by_clientId_and_month", (q) => q.eq("clientId", clientId).eq("month", month))
    .unique();
  if (!report || (opts.onlyPublished && report.status !== "published")) return null;
  const previous = await ctx.db
    .query("clientReports")
    .withIndex("by_clientId_and_month", (q) => q.eq("clientId", clientId).eq("month", addMonths(month, -1)))
    .unique();
  const prevByKey = new Map((previous && (!opts.onlyPublished || previous.status === "published") ? previous.metrics : []).map((m) => [m.key, m.value]));

  const end = addMonths(month, 1);
  const invoices = await ctx.db.query("invoices").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).order("desc").take(300);
  const visible = invoices.filter((i) => i.visibleToClient && (i.status === "sent" || i.status === "overdue" || i.status === "paid"));
  const paid = visible.filter((i) => i.status === "paid" && typeof i.paidAt === "number" && i.paidAt >= month && i.paidAt < end);
  const updates = await ctx.db
    .query("projectUpdates")
    .withIndex("by_clientId_and_visibleToClient", (q) => q.eq("clientId", clientId).eq("visibleToClient", true))
    .order("desc")
    .take(500);
  const docs = await ctx.db.query("documents").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).order("desc").take(300);
  const subs = (await ctx.db.query("subscriptions").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(100)).filter((s) => s.status === "active");

  return {
    month,
    status: report.status,
    publishedAt: report.publishedAt ?? null,
    summary: report.summary ?? null,
    nextSteps: report.nextSteps ?? null,
    metrics: report.metrics.map((m) => ({ key: m.key, label: m.label, unit: m.unit, value: m.value, note: m.note ?? null, previous: prevByKey.get(m.key) ?? null })),
    auto: {
      paidCents: paid.reduce((s, i) => s + i.amountCents, 0),
      paidCount: paid.length,
      invoicesIssued: visible.filter((i) => i.issuedAt >= month && i.issuedAt < end).length,
      projectUpdates: updates.filter((u) => u._creationTime >= month && u._creationTime < end).length,
      documentsDelivered: docs.filter((d) => d.visibleToClient && d.scanStatus === "clean" && d._creationTime >= month && d._creationTime < end).length,
      activeSubscriptions: subs.length,
      monthlyRecurringCents: monthlyRecurringCents(subs),
    },
  };
}

