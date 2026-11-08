"use client";

import { useQuery } from "convex/react";
import { CalendarClock, CircleDollarSign, FolderKanban, Repeat, TrendingUp, TriangleAlert, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { AreaChart, RankList, StackBar } from "@/components/dash/charts";
import { CountUp } from "@/components/dash/CountUp";
import { PageHeader } from "@/components/dash/DashShell";
import { Kpi, KpiGrid, Panel } from "@/components/dash/Kpi";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCents, formatDate, formatEuroRound, formatMonthLong, formatMonthShort } from "@/lib/format";
import { percentChange } from "@convex/lib/metrics";

const money = (n: number) => formatEuroRound(n);

function LoadingState() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Caricamento">
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  );
}

/** Panoramica dell'amministratore: metriche del business, andamento incassi, scadenze. */
export function AdminOverview() {
  // L'ora si arrotonda all'ora intera: cosi' la richiesta resta identica (e in cache) per un'ora.
  const [nowMs] = useState(() => Math.floor(Date.now() / 3_600_000) * 3_600_000);
  const data = useQuery(api.dashboard.overview, { nowMs });

  if (data === undefined) return <LoadingState />;
  const { kpis } = data;
  const monthDelta = percentChange(kpis.collectedThisMonthCents, kpis.collectedLastMonthCents);
  const year = new Date(nowMs).getUTCFullYear();

  return (
    <>
      <PageHeader
        kicker="Panoramica"
        title="Come sta andando CORE829"
        description="Incassi, scadenze e ricavi ricorrenti di tutti i clienti. Gli importi sono quelli registrati nel portale."
      />

      <KpiGrid label="Indicatori principali" oneRow={8}>
        <Kpi size="hero" index={0} tone="accent" icon={Wallet} label={`Incassato ${year}`} value={<CountUp value={kpis.collectedYearCents} format={money} />} hint={`${money(kpis.collectedTotalCents)} in totale`} />
        <Kpi size="compact" index={1} icon={TrendingUp} label="Incassato nel mese" value={<CountUp value={kpis.collectedThisMonthCents} format={money} />} delta={monthDelta} hint={monthDelta === null ? "nessun confronto" : "vs mese scorso"} />
        <Kpi size="compact" index={2} icon={CircleDollarSign} label="Da incassare" value={<CountUp value={kpis.outstandingCents} format={money} />} hint="fatture inviate e scadute" />
        <Kpi
          size="compact"
          index={3}
          tone={kpis.overdueCount > 0 ? "warn" : "default"}
          icon={TriangleAlert}
          label="Scaduto"
          value={<CountUp value={kpis.overdueCents} format={money} />}
          hint={kpis.overdueCount === 0 ? "nessuna fattura scaduta" : `${kpis.overdueCount} ${kpis.overdueCount === 1 ? "fattura" : "fatture"}`}
        />
        <Kpi size="compact" index={4} icon={Repeat} label="Ricavi ricorrenti (MRR)" value={<CountUp value={kpis.mrrCents} format={money} />} hint={`${money(kpis.arrCents)} all'anno`} />
        <Kpi size="compact" index={5} icon={CalendarClock} label="Rinnovi a 30 giorni" value={<CountUp value={kpis.renewals30dCount} format={(n) => String(n)} />} hint={kpis.renewals30dCount === 0 ? "nessun rinnovo" : `${money(kpis.renewals30dCents)} previsti`} />
        <Kpi size="compact" index={6} icon={Users} label="Clienti attivi" value={<CountUp value={kpis.activeClients} format={(n) => String(n)} />} hint={`su ${kpis.totalClients} totali`} />
        <Kpi size="compact" index={7} icon={FolderKanban} label="Progetti in corso" value={<CountUp value={kpis.openProjects} format={(n) => String(n)} />} hint={`${kpis.completedProjects} completati`} />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel index={8} className="lg:col-span-2" title="Incassi negli ultimi 12 mesi" description="Somma delle fatture pagate, per mese di pagamento.">
          <AreaChart
            ariaLabel="Incassato per mese negli ultimi 12 mesi"
            format={money}
            points={data.revenueByMonth.map((m) => ({ label: formatMonthShort(m.monthStart), value: m.cents }))}
          />
        </Panel>
        <Panel index={9} title="Fatture per stato" description="Importo totale per stato (escluse le annullate).">
          <StackBar
            ariaLabel="Ripartizione delle fatture per stato"
            format={money}
            segments={[
              { label: "Pagate", value: data.invoicesByStatus.paid.cents, count: data.invoicesByStatus.paid.count, color: "var(--chart-1)" },
              { label: "Da pagare", value: data.invoicesByStatus.sent.cents, count: data.invoicesByStatus.sent.count, color: "var(--chart-2)" },
              { label: "Scadute", value: data.invoicesByStatus.overdue.cents, count: data.invoicesByStatus.overdue.count, color: "var(--chart-3)" },
              { label: "Bozze", value: data.invoicesByStatus.draft.cents, count: data.invoicesByStatus.draft.count, color: "var(--chart-4)" },
            ]}
          />
        </Panel>

        <Panel index={10} title={`Clienti per incassato ${year}`} description="I primi cinque dell'anno.">
          <RankList
            empty="Nessun incasso registrato quest'anno."
            format={money}
            rows={data.topClients.map((c) => ({ label: c.name, value: c.cents }))}
          />
        </Panel>
        <Panel index={11} className="lg:col-span-2" title="Prossime scadenze" description="Fatture da incassare e rinnovi degli abbonamenti, in ordine di data.">
          {data.upcoming.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Nessuna scadenza in programma.</p>
          ) : (
            <ul className="divide-y">
              {data.upcoming.map((u) => (
                <li key={`${u.kind}-${u.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/admin/clients/${u.clientId}`} className="block truncate font-medium underline-offset-4 hover:underline">
                      {u.label}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {u.clientName} · {u.kind === "invoice" ? "scadenza" : "rinnovo"} {formatDate(u.at)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {u.overdue ? <span className="rounded-full bg-brand-tint px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-brand-deep">Scaduta</span> : null}
                    <span className="font-medium tabular-nums">{formatCents(u.amountCents)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <p className="text-xs text-muted-foreground">
        Dati aggiornati in tempo reale · periodo: {formatMonthLong(Date.UTC(year, new Date(nowMs).getUTCMonth(), 1))}
        {data.truncated ? " · attenzione: elenco molto grande, alcuni dati meno recenti non sono inclusi nei totali." : ""}
      </p>
    </>
  );
}
