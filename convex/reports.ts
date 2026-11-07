import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { requireUnlock, resolveLink } from "./lib/links";
import { fail } from "./lib/errors";
import { addMonths, buildReportView } from "./lib/reportData";
import { cleanMetrics, isMonthStart, MAX_METRICS } from "./lib/reports";
import { cleanText, invalid } from "./lib/text";

/** Report mensili: solo amministratore. Il cliente li legge da `portal.reports` / `portal.report` (solo pubblicati, con sblocco). */

const monthArg = v.number();

function assertMonth(month: number): void {
  if (!isMonthStart(month)) invalid("mese", "Mese non valido.");
  if (month > addMonths(Date.now(), 2) || month < Date.UTC(2020, 0, 1)) invalid("mese", "Mese fuori intervallo.");
}

export const list = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("clientReports")
      .withIndex("by_clientId_and_month", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(60);
    return rows.map((r) => ({ month: r.month, status: r.status, metricCount: r.metrics.length, hasSummary: Boolean(r.summary), updatedAt: r.updatedAt, publishedAt: r.publishedAt ?? null }));
  },
});

/** Un report (anche bozza) con confronto col mese prima e numeri automatici. Null se non esiste ancora. */
export const get = query({
  args: { clientId: v.id("clients"), month: monthArg },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertMonth(args.month);
    return await buildReportView(ctx, args.clientId, args.month, { onlyPublished: false });
  },
});

/** Metriche del mese prima: servono a proporre le stesse voci nel nuovo report. */
export const previousKeys = query({
  args: { clientId: v.id("clients"), month: monthArg },
  handler: async (ctx, args): Promise<string[]> => {
    await requireAdmin(ctx);
    assertMonth(args.month);
    const prev = await ctx.db
      .query("clientReports")
      .withIndex("by_clientId_and_month", (q) => q.eq("clientId", args.clientId).eq("month", addMonths(args.month, -1)))
      .unique();
    return prev ? prev.metrics.map((m) => m.key) : [];
  },
});

export const save = mutation({
  args: {
    clientId: v.id("clients"),
    month: monthArg,
    summary: v.union(v.string(), v.null()),
    nextSteps: v.union(v.string(), v.null()),
    metrics: v.array(v.object({ key: v.string(), label: v.optional(v.string()), unit: v.optional(v.string()), value: v.number(), note: v.optional(v.string()) })),
  },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    assertMonth(args.month);
    if (!(await ctx.db.get("clients", args.clientId))) return fail("NOT_FOUND", "Cliente non trovato.");
    if (args.metrics.length > MAX_METRICS) return invalid("metriche", `Massimo ${MAX_METRICS} metriche per report.`);
    const metrics = cleanMetrics(args.metrics);
    const summary = args.summary === null || args.summary.trim() === "" ? undefined : cleanText(args.summary, { field: "commento", max: 4000, multiline: true });
    const nextSteps = args.nextSteps === null || args.nextSteps.trim() === "" ? undefined : cleanText(args.nextSteps, { field: "prossimi passi", max: 2000, multiline: true });
    const existing = await ctx.db
      .query("clientReports")
      .withIndex("by_clientId_and_month", (q) => q.eq("clientId", args.clientId).eq("month", args.month))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch("clientReports", existing._id, { summary, nextSteps, metrics, updatedAt: now });
    } else {
      await ctx.db.insert("clientReports", { clientId: args.clientId, month: args.month, summary, nextSteps, metrics, status: "draft", updatedAt: now });
    }
    await audit(ctx, { actorType: "admin", actorId, clientId: args.clientId, action: "report.saved", resourceType: "clientReport", metadata: { month: args.month, metrics: metrics.length } });
    return null;
  },
});

export const setPublished = mutation({
  args: { clientId: v.id("clients"), month: monthArg, published: v.boolean() },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    assertMonth(args.month);
    const report = await ctx.db
      .query("clientReports")
      .withIndex("by_clientId_and_month", (q) => q.eq("clientId", args.clientId).eq("month", args.month))
      .unique();
    if (!report) return fail("NOT_FOUND", "Report non trovato.");
    if (args.published && report.metrics.length === 0 && !report.summary) return fail("BAD_STATE", "Aggiungi almeno una metrica o un commento prima di pubblicare.");
    await ctx.db.patch("clientReports", report._id, args.published ? { status: "published", publishedAt: Date.now() } : { status: "draft", publishedAt: undefined });
    await audit(ctx, { actorType: "admin", actorId, clientId: args.clientId, action: args.published ? "report.published" : "report.unpublished", resourceType: "clientReport", resourceId: report._id, metadata: { month: args.month } });
    return null;
  },
});

export const remove = mutation({
  args: { clientId: v.id("clients"), month: monthArg, confirmPublished: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    assertMonth(args.month);
    const report = await ctx.db
      .query("clientReports")
      .withIndex("by_clientId_and_month", (q) => q.eq("clientId", args.clientId).eq("month", args.month))
      .unique();
    if (!report) return fail("NOT_FOUND", "Report non trovato.");
    if (report.status === "published" && args.confirmPublished !== true) return fail("BAD_STATE", "Questo report è già visibile al cliente. Conferma l'eliminazione per cancellarlo.");
    await ctx.db.delete("clientReports", report._id);
    await audit(ctx, { actorType: "admin", actorId, clientId: args.clientId, action: "report.deleted", resourceType: "clientReport", metadata: { month: args.month, wasPublished: report.status === "published" } });
    return null;
  },
});

/** Dati per l'esportazione in PDF da parte del cliente: stessi controlli del portale (link valido + sblocco) e solo report pubblicati. */
export const exportData = internalQuery({
  args: { token: v.string(), unlockToken: v.string(), month: v.number() },
  handler: async (ctx, args) => {
    const link = await resolveLink(ctx, args.token);
    await requireUnlock(ctx, link, args.unlockToken);
    if (!isMonthStart(args.month)) return null;
    const report = await buildReportView(ctx, link.clientId, args.month, { onlyPublished: true });
    const client = await ctx.db.get("clients", link.clientId);
    if (!report || !client) return null;
    return { clientId: link.clientId, clientName: client.displayName, report };
  },
});

export const logExport = internalMutation({
  args: { clientId: v.id("clients"), month: v.number() },
  handler: async (ctx, args): Promise<null> => {
    await audit(ctx, { actorType: "client", clientId: args.clientId, action: "report.exported", resourceType: "clientReport", metadata: { month: args.month } });
    return null;
  },
});
