"use client";

import { Activity, FileText, LayoutDashboard, Users } from "lucide-react";
import { DashShell } from "@/components/dash/DashShell";

/** Menu a gruppi con dati INVENTATI per la prova nel browser. Raggiungibile solo con E2E_FIXTURES=1 (vedi page.tsx). */
export function NavFixture() {
  return (
    <DashShell
      kicker="Prova"
      groups={[
        { items: [{ href: "/fixture-nav", label: "Panoramica", icon: LayoutDashboard, exact: true }] },
        { id: "a", label: "Clienti", items: [{ href: "/fixture-nav/clienti", label: "Tutti i clienti", icon: Users }] },
        { id: "b", label: "Documenti", items: [{ href: "/fixture-nav/modelli", label: "Modelli", icon: FileText }] },
        { id: "c", label: "Sistema", defaultOpen: false, items: [{ href: "/fixture-nav/log", label: "Registro", icon: Activity }] },
      ]}
    >
      <h1>Prova menu</h1>
    </DashShell>
  );
}
