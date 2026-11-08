"use client";

import { CalendarClock, CircleDollarSign, FolderKanban, PenLine, Repeat, TriangleAlert, Wallet } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  collectedByMonth,
  collectedInYear,
  collectedTotal,
  monthlyRecurringCents,
  outstandingCents,
  overdue,
} from "@convex/lib/metrics";
import type { Widget } from "@convex/lib/widgets";
import { CompanyDetails } from "@/components/brand/CompanyDetails";
import { BarChart, Ring, StackBar } from "@/components/dash/charts";
import { CountUp } from "@/components/dash/CountUp";
import { PageHeader } from "@/components/dash/DashShell";
import { Kpi, KpiGrid, Panel } from "@/components/dash/Kpi";
import { enabledPages } from "@/components/portal/PortalChrome";
import { PortalContextProvider, usePortal } from "@/components/portal/PortalContext";
import { PortalDocuments } from "@/components/portal/PortalDocuments";
import { PortalReports } from "@/components/portal/PortalReports";
import { PortalSupport } from "@/components/portal/PortalSupport";
import {
  BillingWidget,
  ContactWidget,
  LinksWidget,
  NoticeWidget,
  OnboardingWidget,
  ProjectsWidget,
  SubscriptionsWidget,
  WelcomeWidget,
  type PortalData,
} from "@/components/portal/PortalPage";
import { formatCents, formatDate, formatEuroRound, formatMonthShort } from "@/lib/format";

const money = (n: number) => formatEuroRound(n);

/** Metriche del cliente, calcolate dai suoi dati con le stesse definizioni dell'area admin. */
function ClientMetrics({ data }: { data: PortalData }) {
  const [now] = useState(() => Date.now());
  const m = useMemo(() => {
    const invoices = data.billing.invoices;
    const open = data.projects.filter((p) => p.status !== "completed").length;
    const avg = data.projects.length === 0 ? 0 : Math.round(data.projects.reduce((s, p) => s + p.progress, 0) / data.projects.length);
    const od = overdue(invoices);
    const nextDue = [
      ...invoices.filter((i) => i.status === "sent" || i.status === "overdue").map((i) => ({ at: i.dueAt, label: `Fattura ${i.number}`, cents: i.amountCents })),
      ...data.subscriptions
        .filter((s) => s.status === "active" && typeof s.nextRenewalAt === "number")
        .map((s) => ({ at: s.nextRenewalAt as number, label: s.name, cents: s.amountCents })),
    ].sort((a, b) => a.at - b.at);
    return {
      paidYear: collectedInYear(invoices, now),
      paidTotal: collectedTotal(invoices),
      outstanding: outstandingCents(invoices),
      overdue: od,
      mrr: monthlyRecurringCents(data.subscriptions),
      activeSubs: data.subscriptions.filter((s) => s.status === "active").length,
      openProjects: open,
      doneProjects: data.projects.length - open,
      avgProgress: avg,
      byMonth: collectedByMonth(invoices, now, 6),
      status: {
        paid: invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amountCents, 0),
        sent: invoices.filter((i) => i.status === "sent").reduce((s, i) => s + i.amountCents, 0),
        overdue: od.cents,
      },
      upcoming: nextDue.slice(0, 4),
    };
  }, [data, now]);
  const year = new Date(now).getUTCFullYear();

  return (
    <div className="space-y-6">
      <KpiGrid label="Riepilogo">
        <Kpi index={0} tone="accent" icon={Wallet} label={`Pagato nel ${year}`} value={<CountUp value={m.paidYear} format={money} />} hint={`${money(m.paidTotal)} in totale`} />
        <Kpi
          index={1}
          tone={m.overdue.count > 0 ? "warn" : "default"}
          icon={m.overdue.count > 0 ? TriangleAlert : CircleDollarSign}
          label="Da pagare"
          value={<CountUp value={m.outstanding} format={money} />}
          hint={m.overdue.count > 0 ? `di cui scaduti ${formatCents(m.overdue.cents)}` : m.outstanding === 0 ? "nulla da pagare" : "nessuna scadenza superata"}
        />
        <Kpi index={2} icon={Repeat} label="Abbonamenti attivi" value={<CountUp value={m.activeSubs} format={(n) => String(n)} />} hint={m.mrr > 0 ? `${formatCents(m.mrr)} al mese` : "nessun costo ricorrente"} />
        <Kpi index={3} icon={FolderKanban} label="Progetti in corso" value={<CountUp value={m.openProjects} format={(n) => String(n)} />} hint={`${m.doneProjects} completati`} />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel index={4} className="lg:col-span-2" title="Pagamenti degli ultimi 6 mesi" description="Quanto hai pagato, mese per mese.">
          <BarChart ariaLabel="Pagamenti per mese negli ultimi 6 mesi" format={money} points={m.byMonth.map((x) => ({ label: formatMonthShort(x.monthStart), value: x.cents }))} />
        </Panel>
        <Panel index={5} title="Avanzamento dei lavori" description="Media di tutti i tuoi progetti.">
          <Ring value={m.avgProgress} label="Avanzamento medio dei progetti" caption="completato" />
        </Panel>
        <Panel index={6} title="Fatture" description="Importi per stato.">
          <StackBar
            ariaLabel="Ripartizione delle fatture per stato"
            format={money}
            segments={[
              { label: "Pagate", value: m.status.paid, color: "var(--chart-1)" },
              { label: "Da pagare", value: m.status.sent, color: "var(--chart-2)" },
              { label: "Scadute", value: m.status.overdue, color: "var(--chart-3)" },
            ]}
          />
        </Panel>
        <Panel index={7} className="lg:col-span-2" title="Prossime scadenze" description="Pagamenti e rinnovi in arrivo.">
          {m.upcoming.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Nessuna scadenza in programma.</p>
          ) : (
            <ul className="divide-y">
              {m.upcoming.map((u) => (
                <li key={`${u.label}-${u.at}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <CalendarClock aria-hidden className="size-4 shrink-0 text-brand" />
                    <span className="truncate font-medium">{u.label}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatDate(u.at)} · <span className="font-medium text-foreground tabular-nums">{formatCents(u.cents)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function NotAvailable({ title }: { title: string }) {
  return (
    <>
      <PageHeader kicker="Pagina non disponibile" title={title} description="Questa sezione non è attiva per il tuo spazio. Se pensi sia un errore, scrivici." />
    </>
  );
}

function PageFrame({ kicker, title, description, children }: { kicker: string; title: string; description: string; children: ReactNode }) {
  return (
    <>
      <PageHeader kicker={kicker} title={title} description={description} />
      {children}
    </>
  );
}

/** Panoramica: i blocchi scelti dall'amministratore (benvenuto, riepilogo, avvisi...) nell'ordine stabilito. */
export function OverviewPage() {
  const { data, base } = usePortal();
  const blocks = (data.widgets as Widget[]).filter((w) => w.type === "welcome" || w.type === "onboarding" || w.type === "summary" || w.type === "notice" || w.type === "links" || w.type === "contact");
  return (
    <>
      {blocks.map((w) => {
        switch (w.type) {
          case "welcome":
            return <WelcomeWidget key={w.id} data={data} />;
          case "onboarding":
            return <OnboardingWidget key={w.id} />;
          case "summary":
            return <ClientMetrics key={w.id} data={data} />;
          case "notice":
            return <NoticeWidget key={w.id} widget={w} />;
          case "links":
            return <LinksWidget key={w.id} widget={w} />;
          case "contact":
            return <ContactWidget key={w.id} widget={w} />;
          default:
            return null;
        }
      })}
      {data.pendingSignatures > 0 ? (
        <a href={`${base}/documents`} className="reveal flex items-center gap-3 rounded-2xl bg-brand-tint p-4 text-sm ring-1 ring-primary/25 hover:bg-brand-tint/70">
          <PenLine aria-hidden className="size-5 shrink-0 text-brand" />
          <span>
            <strong>{data.pendingSignatures === 1 ? "Hai un documento da firmare." : `Hai ${data.pendingSignatures} documenti da firmare.`}</strong> Apri «Documenti» e premi «Firma».
          </span>
        </a>
      ) : null}
      {blocks.length === 0 ? <PageHeader kicker="Panoramica" title={`Ciao ${data.client.contactName}`} /> : null}
      <Panel title="CORE829 SRL" description="A chi scrivere se hai bisogno di noi." index={12}>
        <CompanyDetails />
      </Panel>
    </>
  );
}

export function ProjectsPage() {
  const { data } = usePortal();
  if (!enabledPages(data).projects) return <NotAvailable title="Progetti" />;
  return (
    <PageFrame kicker="Lavori" title="Progetti" description="A che punto è ogni progetto e cosa abbiamo fatto.">
      <ProjectsWidget data={data} />
    </PageFrame>
  );
}

export function BillingPage() {
  const { data } = usePortal();
  if (!enabledPages(data).billing) return <NotAvailable title="Fatture" />;
  return (
    <PageFrame kicker="Pagamenti" title="Fatture" description="Importi, scadenze e pagamenti ricevuti.">
      <BillingWidget data={data} />
    </PageFrame>
  );
}

export function SubscriptionsPage() {
  const { data } = usePortal();
  if (!enabledPages(data).subscriptions) return <NotAvailable title="Abbonamenti" />;
  return (
    <PageFrame kicker="Servizi" title="Abbonamenti" description="I servizi attivi, il costo e il prossimo rinnovo.">
      <SubscriptionsWidget data={data} />
    </PageFrame>
  );
}

export function SupportPage() {
  const { token } = usePortal();
  return (
    <PageFrame kicker="Aiuto" title="Assistenza" description="Scrivici una richiesta e segui le risposte qui, senza perderti tra le email.">
      <PortalSupport token={token} />
    </PageFrame>
  );
}

export function DocumentsPage() {
  const { data, token } = usePortal();
  if (!enabledPages(data).documents) return <NotAvailable title="Documenti" />;
  return (
    <PageFrame kicker="Archivio" title="Contratti e documenti" description="Si aprono con un codice che ti mandiamo via email.">
      <PortalDocuments token={token} />
    </PageFrame>
  );
}

/**
 * Anteprima per l'amministratore: tutte le pagine del cliente una dopo l'altra, con gli stessi componenti
 * che vedra' il cliente. I documenti sono sostituiti da un segnaposto (non servono segreti qui).
 */
export function PortalPreview({ data, documents }: { data: PortalData; documents: ReactNode }) {
  const pages = enabledPages(data);
  return (
    <PortalContextProvider value={{ data, token: "", base: "#" }}>
      <div className="space-y-8">
        <OverviewPage />
        {pages.projects ? <ProjectsPage /> : null}
        {pages.billing ? <BillingPage /> : null}
        {pages.subscriptions ? <SubscriptionsPage /> : null}
        {pages.documents ? (
          <PageFrame kicker="Archivio" title="Contratti e documenti" description="Si aprono con un codice che ti mandiamo via email.">
            {documents}
          </PageFrame>
        ) : null}
      </div>
    </PortalContextProvider>
  );
}

export function ReportsPage() {
  const { data, token } = usePortal();
  if (!data.hasReports) return <NotAvailable title="Report" />;
  return (
    <PageFrame kicker="Risultati" title="Report mensili" description="Come sono andati i tuoi servizi ogni mese. Puoi scaricarli in PDF.">
      <PortalReports token={token} />
    </PageFrame>
  );
}
