"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AccessLinksPanel } from "@/components/admin/AccessLinksPanel";
import { DraftsList } from "@/components/admin/docs/DraftsList";
import { ClientOverview } from "@/components/admin/ClientOverview";
import { DocumentsPanel } from "@/components/admin/DocumentsPanel";
import { NotificationsLog } from "@/components/admin/NotificationsPage";
import { InvoicesPanel } from "@/components/admin/InvoicesPanel";
import { PageBuilder } from "@/components/admin/PageBuilder";
import { ReportsPanel } from "@/components/admin/ReportsPanel";
import { ProjectsPanel } from "@/components/admin/ProjectsPanel";
import { SubscriptionsPanel } from "@/components/admin/SubscriptionsPanel";
import { PageHeader } from "@/components/dash/DashShell";
import { Skeleton } from "@/components/ui/skeleton";
import { clientStatusLabel } from "@/lib/labels";

export type ClientSection = "overview" | "projects" | "invoices" | "subscriptions" | "documents" | "contracts" | "reports" | "page" | "links" | "notifications";

const SECTION_TITLE: Record<ClientSection, string> = {
  overview: "Scheda cliente",
  projects: "Progetti",
  invoices: "Fatture",
  subscriptions: "Abbonamenti",
  documents: "Documenti",
  contracts: "Contratti da inviare",
  reports: "Report mensili",
  page: "Pagina cliente",
  links: "Link di accesso",
  notifications: "Email inviate",
};

/** Una sezione di un cliente, come pagina a se' (nel menu laterale, non in una scheda). */
export function ClientSectionPage({ clientId, section, appUrl }: { clientId: Id<"clients">; section: ClientSection; appUrl: string }) {
  const client = useQuery(api.clients.get, { clientId });

  if (client === undefined) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Caricamento">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (client === null) {
    return <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Cliente non trovato.</p>;
  }

  return (
    <>
      <PageHeader kicker={SECTION_TITLE[section]} title={client.displayName} description={`Stato: ${clientStatusLabel[client.status]} · ${client.email}`} />
      <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 shadow-(--shadow-soft) sm:p-6">
        {section === "overview" ? <ClientOverview client={client} /> : null}
        {section === "projects" ? <ProjectsPanel clientId={clientId} /> : null}
        {section === "invoices" ? <InvoicesPanel clientId={clientId} /> : null}
        {section === "subscriptions" ? <SubscriptionsPanel clientId={clientId} /> : null}
        {section === "documents" ? <DocumentsPanel clientId={clientId} /> : null}
        {section === "contracts" ? <DraftsList clientId={clientId} /> : null}
        {section === "reports" ? <ReportsPanel clientId={clientId} /> : null}
        {section === "page" ? <PageBuilder clientId={clientId} /> : null}
        {section === "notifications" ? <NotificationsLog clientId={clientId} /> : null}
        {section === "links" ? <AccessLinksPanel clientId={clientId} appUrl={appUrl} /> : null}
      </div>
    </>
  );
}
