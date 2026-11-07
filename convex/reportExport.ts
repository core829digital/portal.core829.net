"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { loadBrand } from "./brandActions";
import { COMPANY } from "./lib/autofill";
import type { ModelBlock } from "./lib/docx";
import { renderPdf } from "./lib/docPdf";
import { fail } from "./lib/errors";
import { formatCents } from "./lib/money";
import { formatMetricValue, groupMetrics, metricDelta, monthLabel } from "./lib/reports";

const para = (text: string, o: Partial<Extract<ModelBlock, { type: "p" }>> = {}): ModelBlock => ({ type: "p", text, style: null, bold: false, align: "left", size: null, indent: 0, ...o });

/**
 * Il cliente scarica il report del mese in PDF. Il file e' generato al volo e NON viene salvato da nessuna parte:
 * non esiste un indirizzo pubblico da condividere. Servono link valido + codice di sblocco; ogni download e' nel registro.
 */
export const exportPdf = action({
  args: { token: v.string(), unlockToken: v.string(), month: v.number() },
  handler: async (ctx, args): Promise<{ fileName: string; base64: string }> => {
    const data = await ctx.runQuery(internal.reports.exportData, args);
    if (!data) return fail("NOT_FOUND", "Report non disponibile.");
    const { report, clientName } = data;
    const label = monthLabel(report.month);
    const blocks: ModelBlock[] = [
      para(`Report mensile — ${label}`, { style: "Title" }),
      para(`${clientName} · preparato da ${COMPANY.name}`, { size: 11 }),
    ];
    if (report.summary) blocks.push(para("Commento del mese", { style: "Heading1" }), ...report.summary.split(/\n{2,}/).map((t) => para(t)));
    const groups = groupMetrics(report.metrics);
    for (const g of groups) {
      blocks.push(para(g.label, { style: "Heading1" }), {
        type: "table",
        rows: [
          ["Metrica", "Valore", "Mese prima", "Variazione"],
          ...g.metrics.map((m) => [m.note ? `${m.label} (${m.note})` : m.label, formatMetricValue(m.value, m.unit), m.previous === null ? "—" : formatMetricValue(m.previous, m.unit), metricDelta(m.value, m.previous ?? undefined, m.unit)?.text ?? "—"]),
        ],
      });
    }
    const a = report.auto;
    blocks.push(para("Dal tuo spazio cliente", { style: "Heading1" }), {
      type: "table",
      rows: [
        ["Incassato nel mese", `${formatCents(a.paidCents)} (${a.paidCount} fatture)`],
        ["Fatture emesse", String(a.invoicesIssued)],
        ["Aggiornamenti di progetto", String(a.projectUpdates)],
        ["Documenti consegnati", String(a.documentsDelivered)],
        ["Abbonamenti attivi", `${a.activeSubscriptions} (${formatCents(a.monthlyRecurringCents)} al mese)`],
      ],
    });
    if (report.nextSteps) blocks.push(para("Prossimi passi", { style: "Heading1" }), ...report.nextSteps.split(/\n{2,}/).map((t) => para(t)));
    blocks.push(para(`Report riservato a ${clientName}. Per dubbi scrivi a ${COMPANY.email}.`, { size: 9 }));

    const bytes = await renderPdf(blocks, { title: `Report ${label} — ${clientName}`, brand: await loadBrand(ctx) });
    await ctx.runMutation(internal.reports.logExport, { clientId: data.clientId, month: report.month });
    const slug = clientName.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "cliente";
    return { fileName: `Report-${slug}-${new Date(report.month).getUTCFullYear()}-${String(new Date(report.month).getUTCMonth() + 1).padStart(2, "0")}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  },
});
