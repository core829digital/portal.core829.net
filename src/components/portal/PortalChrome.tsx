"use client";

import { FileText, FolderKanban, LayoutDashboard, Receipt, Repeat } from "lucide-react";
import type { ReactNode } from "react";
import type { Widget } from "@convex/lib/widgets";
import { DashShell, type NavGroup } from "@/components/dash/DashShell";
import { PortalContextProvider } from "@/components/portal/PortalContext";
import type { PortalData } from "@/components/portal/PortalPage";

/** Quali pagine mostrare nel menu: solo quelle i cui blocchi sono attivi per questo cliente (scelta dell'amministratore). */
export function enabledPages(data: PortalData) {
  const types = new Set((data.widgets as Widget[]).filter((w) => w.enabled).map((w) => w.type));
  return {
    projects: types.has("projects"),
    billing: types.has("billing"),
    subscriptions: types.has("subscriptions"),
    documents: types.has("documents"),
  };
}

/** Cornice del portale cliente: menu laterale a pagine + dati condivisi dalle pagine. */
export function PortalChrome({ data, token, base, children }: { data: PortalData; token: string; base: string; children: ReactNode }) {
  const pages = enabledPages(data);
  const items = [
    { href: base, label: "Panoramica", icon: LayoutDashboard, exact: true },
    ...(pages.projects ? [{ href: `${base}/projects`, label: "Progetti", icon: FolderKanban }] : []),
    ...(pages.billing ? [{ href: `${base}/billing`, label: "Fatture", icon: Receipt }] : []),
    ...(pages.subscriptions ? [{ href: `${base}/subscriptions`, label: "Abbonamenti", icon: Repeat }] : []),
    ...(pages.documents ? [{ href: `${base}/documents`, label: "Documenti", icon: FileText }] : []),
  ];
  const groups: NavGroup[] = [{ items }];

  return (
    <PortalContextProvider value={{ data, token, base }}>
      <DashShell
        groups={groups}
        kicker="Il tuo spazio"
        footer={
          <div className="space-y-1 px-3 text-xs text-muted-foreground">
            <p className="truncate font-medium text-foreground">{data.client.displayName}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em]">Solo lettura</p>
            <p>Per qualsiasi dubbio rispondi al messaggio con cui hai ricevuto questo link.</p>
          </div>
        }
      >
        {children}
      </DashShell>
    </PortalContextProvider>
  );
}
