"use client";

import type { FunctionReturnType } from "convex/server";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "@convex/_generated/api";
import type { Widget } from "@convex/lib/widgets";
import { StackBar } from "@/components/dash/charts";
import { CountUp } from "@/components/dash/CountUp";
import { PageHeader } from "@/components/dash/DashShell";
import { Panel } from "@/components/dash/Kpi";
import { ProgressBar } from "@/components/ProgressBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, formatDate, formatDateTime } from "@/lib/format";
import { intervalLabel, invoiceStatusLabel, projectStatusLabel, subscriptionStatusLabel } from "@/lib/labels";
import { useLocalFlag } from "@/lib/localFlag";
import { ONBOARDING_FLAG_KEY } from "@/lib/onboardingFlag";

export type PortalData = FunctionReturnType<typeof api.portal.overview>;

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="reveal space-y-4">
      <h2 id={id} className="font-display text-lg tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function WelcomeWidget({ data }: { data: PortalData }) {
  return (
    <PageHeader
      kicker="Panoramica"
      title={`Ciao ${data.client.contactName}`}
      description={data.client.welcomeMessage ?? "Qui trovi tutto quello che riguarda il tuo progetto con noi."}
    />
  );
}

export function OnboardingWidget() {
  const [seen, markSeen] = useLocalFlag(ONBOARDING_FLAG_KEY);
  if (seen) return null;
  return (
    <Card data-onboarding className="reveal bg-brand-tint ring-primary/20">
      <CardHeader>
        <CardTitle>Come funziona questo spazio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="grid gap-3 text-sm sm:grid-cols-3">
          <li className="rounded-lg bg-background p-3">
            <strong className="block">1. Guarda i lavori</strong>
            Vedi a che punto è ogni progetto e cosa abbiamo fatto.
          </li>
          <li className="rounded-lg bg-background p-3">
            <strong className="block">2. Controlla gli importi</strong>
            Trovi fatture, scadenze e abbonamenti attivi.
          </li>
          <li className="rounded-lg bg-background p-3">
            <strong className="block">3. Leggi i documenti</strong>
            Contratti e fatture si aprono con un codice che ti mandiamo via email.
          </li>
        </ol>
        <p className="text-sm text-muted-foreground">Qui si guarda soltanto: non devi fare nulla e non serve nessuna password.</p>
        <Button onClick={markSeen}>Ho capito</Button>
      </CardContent>
    </Card>
  );
}

export function ProjectsWidget({ data }: { data: PortalData }) {
  return (
    <Section id="projects-heading" title="I tuoi progetti">
      {data.projects.length === 0 ? (
        <Empty>Qui compariranno i tuoi progetti appena li avremo avviati.</Empty>
      ) : (
        <div className="grid gap-4">
          {data.projects.map((project) => (
            <Card key={project.id} className="rounded-2xl shadow-(--shadow-soft)">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">{project.name}</CardTitle>
                  {project.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{project.description}</p> : null}
                </div>
                <Badge variant={project.status === "completed" ? "default" : "secondary"}>{projectStatusLabel[project.status]}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <ProgressBar value={project.progress} />
                <p className="text-sm text-muted-foreground">
                  {project.startDate ? `Iniziato il ${formatDate(project.startDate)}` : null}
                  {project.startDate && project.dueDate ? " · " : null}
                  {project.dueDate ? `Consegna prevista: ${formatDate(project.dueDate)}` : null}
                </p>
                {project.updates.length > 0 ? (
                  <ol className="space-y-3 border-t pt-4" aria-label={`Aggiornamenti: ${project.name}`}>
                    {project.updates.map((u, i) => (
                      <li key={`${u.at}-${i}`} className="text-sm">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-medium">{u.title}</span>
                          <span className="text-xs text-muted-foreground">{formatDateTime(u.at)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-muted-foreground">{u.body}</p>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Section>
  );
}

/** Stato economico in un colpo d'occhio: importo ancora da pagare (che scorre fino al valore) e ripartizione delle fatture. */
function BillingSummary({ invoices, outstandingCents }: { invoices: PortalData["billing"]["invoices"]; outstandingCents: number }) {
  const sum = (status: string) => invoices.filter((i) => i.status === status).reduce((t, i) => t + i.amountCents, 0);
  const paid = sum("paid");
  const open = sum("sent");
  const overdue = sum("overdue");
  return (
    <Panel title="Il tuo stato economico" description={outstandingCents === 0 ? "Non c'è nulla da pagare. Grazie!" : "Importo ancora da pagare e ripartizione delle fatture."}>
      <div className="grid items-center gap-5 sm:grid-cols-[auto_1fr] sm:gap-8">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Da pagare</p>
          <p className="mt-1 font-display text-3xl leading-none tracking-tight">
            <CountUp value={outstandingCents} format={formatCents} />
          </p>
        </div>
        <StackBar
          ariaLabel="Ripartizione delle fatture per stato"
          format={formatCents}
          segments={[
            { label: "Pagate", value: paid, color: "var(--chart-1)" },
            { label: "Da pagare", value: open, color: "var(--chart-2)" },
            { label: "Scadute", value: overdue, color: "var(--chart-3)" },
          ]}
        />
      </div>
    </Panel>
  );
}

export function BillingWidget({ data }: { data: PortalData }) {
  const { outstandingCents, invoices } = data.billing;
  return (
    <Section id="billing-heading" title="Fatture e pagamenti">
      {invoices.length === 0 ? (
        <Empty>Non ci sono ancora fatture.</Empty>
      ) : (
        <>
          <BillingSummary invoices={invoices} outstandingCents={outstandingCents} />
          <ul className="stagger divide-y rounded-2xl bg-card ring-1 ring-foreground/10">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4">
                <div>
                  <p className="font-medium">Fattura {invoice.number}</p>
                  {invoice.subscriptionName ? <p className="text-sm text-muted-foreground">Abbonamento: {invoice.subscriptionName}</p> : null}
                  <p className="text-sm text-muted-foreground">
                    Emessa il {formatDate(invoice.issuedAt)}
                    {invoice.status === "paid" && invoice.paidAt ? ` · pagata il ${formatDate(invoice.paidAt)}` : ` · scade il ${formatDate(invoice.dueAt)}`}
                  </p>
                  {invoice.note ? <p className="mt-1 text-sm text-muted-foreground">{invoice.note}</p> : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold tabular-nums">{formatCents(invoice.amountCents)}</span>
                  <Badge variant={invoice.status === "paid" ? "default" : invoice.status === "overdue" ? "destructive" : "secondary"}>
                    {invoiceStatusLabel[invoice.status]}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

export function SubscriptionsWidget({ data }: { data: PortalData }) {
  return (
    <Section id="subscriptions-heading" title="I tuoi abbonamenti">
      {data.subscriptions.length === 0 ? (
        <Empty>Non hai abbonamenti attivi.</Empty>
      ) : (
        <ul className="divide-y rounded-2xl bg-card ring-1 ring-foreground/10">
          {data.subscriptions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4">
              <div>
                <p className="font-medium">{s.name}</p>
                {s.description ? <p className="text-sm text-muted-foreground">{s.description}</p> : null}
                {s.nextRenewalAt ? <p className="text-sm text-muted-foreground">Prossimo rinnovo: {formatDate(s.nextRenewalAt)}</p> : null}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold tabular-nums">
                  {formatCents(s.amountCents)} <span className="text-xs font-normal text-muted-foreground">{intervalLabel[s.interval]}</span>
                </span>
                <Badge variant={s.status === "active" ? "default" : "secondary"}>{subscriptionStatusLabel[s.status]}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Contenuto scritto dall'amministratore: solo testo, mostrato con l'escape di React (mai come HTML). */
export function NoticeWidget({ widget }: { widget: Extract<Widget, { type: "notice" }> }) {
  return (
    <Card role="note" className="border-primary/30">
      <CardHeader>
        <CardTitle>{widget.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm leading-6">{widget.body}</p>
      </CardContent>
    </Card>
  );
}

export function ContactWidget({ widget }: { widget: Extract<Widget, { type: "contact" }> }) {
  return (
    <Section id={`contact-${widget.id}`} title={widget.title}>
      <Card>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-6">{widget.body}</p>
        </CardContent>
      </Card>
    </Section>
  );
}

export function LinksWidget({ widget }: { widget: Extract<Widget, { type: "links" }> }) {
  return (
    <Section id={`links-${widget.id}`} title={widget.title}>
      <ul className="divide-y rounded-2xl bg-card ring-1 ring-foreground/10">
        {widget.items
          // Difesa in piu': il server ammette solo https, qui non si mostra mai nient'altro.
          .filter((item) => item.url.startsWith("https://"))
          .map((item) => (
            <li key={item.url + item.label}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 p-4 text-sm font-medium underline-offset-4 hover:bg-muted/50 hover:underline"
              >
                <span>{item.label}</span>
                <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-label="si apre in una nuova scheda" />
              </a>
            </li>
          ))}
      </ul>
    </Section>
  );
}
