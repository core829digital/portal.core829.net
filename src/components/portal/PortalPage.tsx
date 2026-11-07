"use client";

import type { FunctionReturnType } from "convex/server";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "@convex/_generated/api";
import type { Widget } from "@convex/lib/widgets";
import { ProgressBar } from "@/components/ProgressBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, formatDate, formatDateTime } from "@/lib/format";
import { intervalLabel, invoiceStatusLabel, projectStatusLabel, subscriptionStatusLabel } from "@/lib/labels";
import { useLocalFlag } from "@/lib/localFlag";

export type PortalData = FunctionReturnType<typeof api.portal.overview>;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function WelcomeWidget({ data }: { data: PortalData }) {
  return (
    <div className="space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight">Ciao {data.client.contactName}</h1>
      <p className="whitespace-pre-wrap text-base leading-7 text-muted-foreground">
        {data.client.welcomeMessage ?? "Qui trovi tutto quello che riguarda il tuo progetto con noi."}
      </p>
    </div>
  );
}

function OnboardingWidget() {
  const [seen, markSeen] = useLocalFlag("portal-onboarding-v1");
  if (seen) return null;
  return (
    <Card className="border-primary/30 bg-primary/5">
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

function SummaryWidget({ data }: { data: PortalData }) {
  const openProjects = data.projects.filter((p) => p.status !== "completed").length;
  const activeSubscriptions = data.subscriptions.filter((s) => s.status === "active").length;
  const { outstandingCents, overdueCents } = data.billing;
  return (
    <div className="grid gap-4 sm:grid-cols-3" role="list" aria-label="Riepilogo">
      <Card role="listitem">
        <CardContent>
          <p className="text-sm text-muted-foreground">Progetti in corso</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{openProjects}</p>
        </CardContent>
      </Card>
      <Card role="listitem">
        <CardContent>
          <p className="text-sm text-muted-foreground">Da pagare</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{formatCents(outstandingCents)}</p>
          {overdueCents > 0 ? <p className="mt-1 text-sm font-medium text-destructive">di cui scaduti {formatCents(overdueCents)}</p> : null}
        </CardContent>
      </Card>
      <Card role="listitem">
        <CardContent>
          <p className="text-sm text-muted-foreground">Abbonamenti attivi</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{activeSubscriptions}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectsWidget({ data }: { data: PortalData }) {
  return (
    <Section id="projects-heading" title="I tuoi progetti">
      {data.projects.length === 0 ? (
        <Empty>Qui compariranno i tuoi progetti appena li avremo avviati.</Empty>
      ) : (
        <div className="grid gap-4">
          {data.projects.map((project) => (
            <Card key={project.id}>
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

function BillingWidget({ data }: { data: PortalData }) {
  const { outstandingCents, invoices } = data.billing;
  return (
    <Section id="billing-heading" title="Fatture e pagamenti">
      {invoices.length === 0 ? (
        <Empty>Non ci sono ancora fatture.</Empty>
      ) : (
        <>
          {outstandingCents === 0 ? <p className="text-sm text-muted-foreground">Non c&apos;è nulla da pagare. Grazie!</p> : null}
          <ul className="divide-y rounded-lg border">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4">
                <div>
                  <p className="font-medium">Fattura {invoice.number}</p>
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

function SubscriptionsWidget({ data }: { data: PortalData }) {
  return (
    <Section id="subscriptions-heading" title="I tuoi abbonamenti">
      {data.subscriptions.length === 0 ? (
        <Empty>Non hai abbonamenti attivi.</Empty>
      ) : (
        <ul className="divide-y rounded-lg border">
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
function NoticeWidget({ widget }: { widget: Extract<Widget, { type: "notice" }> }) {
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

function ContactWidget({ widget }: { widget: Extract<Widget, { type: "contact" }> }) {
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

function LinksWidget({ widget }: { widget: Extract<Widget, { type: "links" }> }) {
  return (
    <Section id={`links-${widget.id}`} title={widget.title}>
      <ul className="divide-y rounded-lg border">
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

function WidgetView({ widget, data, documents }: { widget: Widget; data: PortalData; documents: ReactNode }) {
  switch (widget.type) {
    case "welcome":
      return <WelcomeWidget data={data} />;
    case "onboarding":
      return <OnboardingWidget />;
    case "summary":
      return <SummaryWidget data={data} />;
    case "projects":
      return <ProjectsWidget data={data} />;
    case "billing":
      return <BillingWidget data={data} />;
    case "subscriptions":
      return <SubscriptionsWidget data={data} />;
    case "documents":
      return <>{documents}</>;
    case "notice":
      return <NoticeWidget widget={widget} />;
    case "contact":
      return <ContactWidget widget={widget} />;
    case "links":
      return <LinksWidget widget={widget} />;
  }
}

/** La pagina del cliente: i blocchi attivi, nell'ordine scelto dall'amministratore. */
export function PortalPage({ data, documents }: { data: PortalData; documents: ReactNode }) {
  return (
    <>
      {(data.widgets as Widget[]).map((widget) => (
        <WidgetView key={widget.id} widget={widget} data={data} documents={documents} />
      ))}
    </>
  );
}
