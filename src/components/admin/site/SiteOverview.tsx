"use client";

import { useQuery } from "convex/react";
import { Eye, Globe, Inbox, Megaphone, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { AreaChart, RankList } from "@/components/dash/charts";
import { CountUp } from "@/components/dash/CountUp";
import { PageHeader } from "@/components/dash/DashShell";
import { Kpi, KpiGrid, Panel } from "@/components/dash/Kpi";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { SITE_URL } from "@/lib/contact";

const n = (x: number) => new Intl.NumberFormat("it-IT").format(x);

/** Panoramica del sito core829.net: visite (solo con consenso agli analytics), richieste dal modulo contatti, SEO e avviso. */
export function SiteOverview() {
  const [days, setDays] = useState(30);
  const data = useQuery(api.site.overview, { days });
  return (
    <>
      <PageHeader
        kicker="Sito core829.net"
        title="Panoramica del sito"
        description="Richieste dal modulo contatti e visite. Le visite contano solo chi ha accettato i cookie analitici, senza dati personali: sono un'indicazione, non il totale reale."
        actions={
          <>
            <div role="group" aria-label="Periodo" className="flex gap-1">
              {[7, 30, 90].map((d) => (
                <Button key={d} size="sm" variant={days === d ? "default" : "outline"} aria-pressed={days === d} onClick={() => setDays(d)}>
                  {d} giorni
                </Button>
              ))}
            </div>
            <Button size="sm" variant="outline" nativeButton={false} render={<a href={SITE_URL} target="_blank" rel="noopener noreferrer" />}>
              <Globe aria-hidden /> Apri il sito
            </Button>
          </>
        }
      />
      {data === undefined ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <>
          <KpiGrid label="Riepilogo del sito">
            <Kpi index={0} tone={data.newMessages > 0 ? "accent" : "default"} icon={Inbox} label="Richieste da gestire" value={<CountUp value={data.newMessages} format={n} />} hint={data.lastMessageAt ? `ultima: ${formatDateTime(data.lastMessageAt)}` : "nessuna richiesta"} />
            <Kpi index={1} icon={Eye} label={`Visite (${days} giorni)`} value={<CountUp value={data.views} format={n} />} hint="solo con consenso analytics" />
            <Kpi index={2} icon={Search} label="Pagine con SEO personalizzata" value={<CountUp value={data.seoOverrides} format={n} />} hint="le altre usano il testo del sito" />
            <Kpi index={3} icon={Megaphone} label="Avviso in testata" value={data.announcementActive ? "Attivo" : "Spento"} hint={data.announcementActive ? "visibile a tutti i visitatori" : "nessun avviso mostrato"} />
          </KpiGrid>
          {data.newMessages > 0 ? (
            <Link href="/admin/site/messages" className="block rounded-2xl bg-brand-tint p-4 text-sm ring-1 ring-primary/25 hover:bg-brand-tint/70">
              <strong>{data.newMessages === 1 ? "C'è una richiesta nuova" : `Ci sono ${data.newMessages} richieste nuove`}</strong> dal modulo contatti: aprile e rispondi.
            </Link>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel index={4} className="lg:col-span-2" title={`Visite negli ultimi ${days} giorni`} description="Pagine viste ogni giorno.">
              <AreaChart ariaLabel={`Visite al sito negli ultimi ${days} giorni`} format={n} points={data.series.map((p) => ({ label: `${p.day.slice(8)}/${p.day.slice(5, 7)}`, value: p.value }))} />
            </Panel>
            <Panel index={5} title="Pagine più viste">
              <RankList format={n} empty="Ancora nessuna visita registrata." rows={data.topPaths} />
            </Panel>
          </div>
          <Panel index={6} title="Lingue dei visitatori" description="Le visite per lingua del sito.">
            <RankList format={n} empty="Ancora nessuna visita registrata." rows={data.topLocales} />
          </Panel>
        </>
      )}
    </>
  );
}
