"use client";

import { useAction, useQuery } from "convex/react";
import { ArrowDown, ArrowUp, Download, Minus } from "lucide-react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { formatMetricValue, groupMetrics, metricDelta, monthLabel } from "@convex/lib/reports";
import { Kpi, KpiGrid, Panel } from "@/components/dash/Kpi";
import { ErrorBoundary } from "@/components/portal/ErrorBoundary";
import { UnlockGate } from "@/components/portal/PortalDocuments";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "cn";

export type ReportData = {
  month: number;
  summary: string | null;
  nextSteps: string | null;
  metrics: { key: string; label: string; unit: "count" | "percent" | "eur" | "seconds" | "decimal"; value: number; note: string | null; previous: number | null }[];
  auto: { paidCents: number; paidCount: number; invoicesIssued: number; projectUpdates: number; documentsDelivered: number; activeSubscriptions: number; monthlyRecurringCents: number };
};

/** Il report di un mese: commento, numeri per servizio col confronto sul mese prima, numeri del portale e prossimi passi. */
export function ReportView({ report }: { report: ReportData }) {
  const groups = groupMetrics(report.metrics);
  return (
    <div className="space-y-5">
      {report.summary ? (
        <Panel title="Com'è andato il mese" index={0}>
          <p className="whitespace-pre-wrap text-sm leading-6">{report.summary}</p>
        </Panel>
      ) : null}
      {groups.map((g, gi) => (
        <section key={g.id} aria-label={g.label} className="space-y-2">
          <h3 className="font-display text-base tracking-tight">{g.label}</h3>
          <KpiGrid label={g.label}>
            {g.metrics.map((m, i) => {
              const d = metricDelta(m.value, m.previous ?? undefined, m.unit);
              return (
                <Kpi
                  key={m.key}
                  index={gi * 3 + i}
                  label={m.label}
                  value={formatMetricValue(m.value, m.unit)}
                  hint={
                    d ? (
                      <span className={cn("inline-flex items-center gap-1", d.direction === "up" && "text-emerald-700", d.direction === "down" && "text-red-700")}>
                        {d.direction === "up" ? <ArrowUp aria-hidden className="size-3" /> : d.direction === "down" ? <ArrowDown aria-hidden className="size-3" /> : <Minus aria-hidden className="size-3" />}
                        {d.text} sul mese prima{m.note ? ` · ${m.note}` : ""}
                      </span>
                    ) : (
                      m.note ?? "primo dato disponibile"
                    )
                  }
                />
              );
            })}
          </KpiGrid>
        </section>
      ))}
      <Panel title="Dal tuo spazio cliente" description="Calcolati dal portale per questo mese." index={6}>
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Pagamenti ricevuti</dt><dd>{formatCents(report.auto.paidCents)} ({report.auto.paidCount})</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Fatture emesse</dt><dd>{report.auto.invoicesIssued}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Aggiornamenti sui progetti</dt><dd>{report.auto.projectUpdates}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Documenti consegnati</dt><dd>{report.auto.documentsDelivered}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Abbonamenti attivi</dt><dd>{report.auto.activeSubscriptions} ({formatCents(report.auto.monthlyRecurringCents)} al mese)</dd></div>
        </dl>
      </Panel>
      {report.nextSteps ? (
        <Panel title="Prossimi passi" index={7}>
          <p className="whitespace-pre-wrap text-sm leading-6">{report.nextSteps}</p>
        </Panel>
      ) : null}
    </div>
  );
}

/** Selettore dei mesi + report scelto + scarico in PDF. */
export function ReportsBrowser({
  months,
  selected,
  onSelect,
  report,
  onDownload,
  downloading,
}: {
  months: { month: number }[];
  selected: number | null;
  onSelect: (m: number) => void;
  report: ReportData | null | undefined;
  onDownload: () => void;
  downloading: boolean;
}) {
  if (months.length === 0) return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Il primo report arriverà a fine mese.</p>;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Scegli il mese" className="flex flex-wrap gap-1.5">
          {months.map((m) => (
            <button
              key={m.month}
              type="button"
              aria-pressed={m.month === selected}
              onClick={() => onSelect(m.month)}
              className={cn("min-h-9 rounded-full px-3.5 text-sm capitalize ring-1 transition-colors", m.month === selected ? "bg-brand text-white ring-brand" : "ring-foreground/15 hover:bg-muted")}
            >
              {monthLabel(m.month)}
            </button>
          ))}
        </div>
        <Button className="ml-auto" variant="outline" onClick={onDownload} disabled={downloading || !report}>
          <Download aria-hidden /> {downloading ? "Preparo il PDF…" : "Scarica il PDF"}
        </Button>
      </div>
      {report === undefined ? <p className="text-sm text-muted-foreground">Caricamento…</p> : report === null ? <p className="text-sm text-muted-foreground">Report non disponibile.</p> : <ReportView report={report} />}
    </div>
  );
}

function ReportsContainer({ token, unlockToken }: { token: string; unlockToken: string }) {
  const months = useQuery(api.portal.reports, { token, unlockToken });
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked ?? months?.[0]?.month ?? null;
  const report = useQuery(api.portal.report, selected === null ? "skip" : { token, unlockToken, month: selected });
  const exportPdf = useAction(api.reportExport.exportPdf);
  const [busy, setBusy] = useState(false);

  async function download() {
    if (selected === null) return;
    setBusy(true);
    try {
      const { fileName, base64 } = await exportPdf({ token, unlockToken, month: selected });
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = window.document.createElement("a");
      a.href = url;
      a.download = fileName;
      window.document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error("Non siamo riusciti a preparare il PDF. Riprova tra poco.");
    } finally {
      setBusy(false);
    }
  }

  if (months === undefined) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  return <ReportsBrowser months={months} selected={selected} onSelect={setPicked} report={report} onDownload={() => void download()} downloading={busy} />;
}

export function PortalReports({ token }: { token: string }) {
  return (
    <UnlockGate
      token={token}
      heading="Report mensili"
      intro="I report contengono i numeri della tua attività. Per proteggerli ti mandiamo un codice di 6 cifre via email."
      submitLabel="Mostra i report"
    >
      {(unlockToken) => (
        <ErrorBoundary fallback={() => <p className="text-sm">La sessione è scaduta: ricarica la pagina e richiedi un nuovo codice.</p>}>
          <ReportsContainer token={token} unlockToken={unlockToken} />
        </ErrorBoundary>
      )}
    </UnlockGate>
  );
}
