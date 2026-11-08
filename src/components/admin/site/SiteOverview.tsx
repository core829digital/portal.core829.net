"use client";

import { Eye, FileText, FolderKanban, Inbox, MousePointerClick, Percent } from "lucide-react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { BridgeError, SiteLoading } from "@/components/admin/site/SiteBits";
import { useSiteData } from "@/components/admin/site/useSiteData";
import { AreaChart, RankList } from "@/components/dash/charts";
import { CountUp } from "@/components/dash/CountUp";
import { PageHeader } from "@/components/dash/DashShell";
import { Kpi, KpiGrid, Panel } from "@/components/dash/Kpi";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

const n = (x: number) => new Intl.NumberFormat("it-IT").format(x);

/** Panoramica del sito Andromedia Web: visite, clic, contenuti e messaggi. */
export function SiteOverview() {
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useSiteData(api.siteActions.dashboard, { days });

  return (
    <>
      <PageHeader
        kicker="Sito Andromedia Web"
        title="Panoramica del sito"
        description="Visite e clic degli ultimi giorni, contenuti pubblicati e messaggi ricevuti dal modulo contatti."
        actions={
          <div role="group" aria-label="Periodo" className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <Button key={d} size="sm" variant={days === d ? "default" : "outline"} aria-pressed={days === d} onClick={() => setDays(d)}>
                {d} giorni
              </Button>
            ))}
          </div>
        }
      />
      {error && !data ? <BridgeError message={error} onRetry={() => void reload()} /> : null}
      {loading && !data ? <SiteLoading /> : null}
      {data ? (
        <>
          <KpiGrid label="Riepilogo del sito">
            <Kpi index={0} tone="accent" icon={Eye} label="Visite oggi" value={<CountUp value={data.summary.viewsToday} format={n} />} hint={`${n(data.summary.views7)} negli ultimi 7 giorni`} />
            <Kpi index={1} icon={Eye} label="Visite (30 giorni)" value={<CountUp value={data.summary.views30} format={n} />} hint={`${n(data.summary.total)} eventi in archivio`} />
            <Kpi index={2} icon={MousePointerClick} label="Clic (30 giorni)" value={<CountUp value={data.summary.clicks30} format={n} />} hint={`${n(data.summary.clicksToday)} oggi`} />
            <Kpi index={3} icon={Percent} label="Clic su visite" value={`${data.summary.ctr30}%`} hint="tasso di clic a 30 giorni" />
            <Kpi index={4} icon={FileText} label="Articoli" value={<CountUp value={data.counts.posts} format={n} />} hint={`${data.counts.published} pubblicati`} />
            <Kpi index={5} icon={FolderKanban} label="Lavori in portfolio" value={<CountUp value={data.counts.works} format={n} />} hint="mostrati sul sito" />
            <Kpi index={6} icon={Inbox} label="Messaggi ricevuti" value={<CountUp value={data.counts.messages} format={n} />} hint={data.counts.lastMessageAt ? `ultimo: ${formatDateTime(data.counts.lastMessageAt)}` : "nessun messaggio"} />
          </KpiGrid>
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel index={8} className="lg:col-span-2" title={`Visite negli ultimi ${days} giorni`} description="Pagine viste ogni giorno sul sito.">
              <AreaChart ariaLabel={`Visite al sito negli ultimi ${days} giorni`} format={n} points={data.series.map((p) => ({ label: p.day.slice(8) + "/" + p.day.slice(5, 7), value: p.views }))} />
            </Panel>
            <Panel index={9} title="Pagine più viste" description={`Ultimi ${days} giorni`}>
              <RankList format={n} empty="Ancora nessuna visita registrata." rows={data.topPaths.map((p) => ({ label: p.path, value: p.count }))} />
            </Panel>
          </div>
          <Panel index={10} title="Clic più frequenti" description="Pulsanti e sezioni cliccati.">
            <RankList format={n} empty="Ancora nessun clic registrato." rows={data.topLabels.map((p) => ({ label: p.label, value: p.count }))} />
          </Panel>
        </>
      ) : null}
    </>
  );
}
