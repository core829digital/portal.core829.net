"use client";

import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AccessLinksPanel } from "@/components/admin/AccessLinksPanel";
import { ClientOverview } from "@/components/admin/ClientOverview";
import { DocumentsPanel } from "@/components/admin/DocumentsPanel";
import { InvoicesPanel } from "@/components/admin/InvoicesPanel";
import { PageBuilder } from "@/components/admin/PageBuilder";
import { ProjectsPanel } from "@/components/admin/ProjectsPanel";
import { SubscriptionsPanel } from "@/components/admin/SubscriptionsPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ClientDetail({ clientId, appUrl }: { clientId: Id<"clients">; appUrl: string }) {
  const client = useQuery(api.clients.get, { clientId });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Tutti i clienti
      </Link>

      {client === undefined ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : client === null ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Cliente non trovato.</p>
      ) : (
        <>
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">{client.displayName}</h1>
          <Tabs defaultValue="overview">
            <TabsList className="mb-6 flex-wrap h-auto">
              <TabsTrigger value="overview">Panoramica</TabsTrigger>
              <TabsTrigger value="projects">Progetti</TabsTrigger>
              <TabsTrigger value="invoices">Fatture</TabsTrigger>
              <TabsTrigger value="subscriptions">Abbonamenti</TabsTrigger>
              <TabsTrigger value="documents">Documenti</TabsTrigger>
              <TabsTrigger value="page">Pagina</TabsTrigger>
              <TabsTrigger value="links">Link di accesso</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <ClientOverview client={client} />
            </TabsContent>
            <TabsContent value="projects">
              <ProjectsPanel clientId={clientId} />
            </TabsContent>
            <TabsContent value="invoices">
              <InvoicesPanel clientId={clientId} />
            </TabsContent>
            <TabsContent value="subscriptions">
              <SubscriptionsPanel clientId={clientId} />
            </TabsContent>
            <TabsContent value="documents">
              <DocumentsPanel clientId={clientId} />
            </TabsContent>
            <TabsContent value="page">
              <PageBuilder clientId={clientId} />
            </TabsContent>
            <TabsContent value="links">
              <AccessLinksPanel clientId={clientId} appUrl={appUrl} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </main>
  );
}
