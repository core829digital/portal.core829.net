"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import {
  Activity,
  BarChart3,
  Bell,
  CreditCard,
  FilePen,
  FileStack,
  FileText,
  Globe,
  Inbox,
  FolderKanban,
  LayoutDashboard,
  LayoutTemplate,
  Link2,
  LogOut,
  Megaphone,
  PenLine,
  Receipt,
  Repeat,
  SearchCheck,
  Stamp,
  UserRound,
  Users,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AdminGate } from "@/components/admin/AdminGate";
import { ErrorBoundary } from "@/components/portal/ErrorBoundary";
import { errorCode } from "@/lib/errors";
import { AdminToolbar } from "@/components/admin/AdminToolbar";
import { DashShell, type NavGroup } from "@/components/dash/DashShell";
import { Button } from "@/components/ui/button";

const CONVEX_ID = /^[a-z0-9]{16,64}$/;

function Frame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const params = useParams<{ clientId?: string }>();
  const clientId = params.clientId && CONVEX_ID.test(params.clientId) ? (params.clientId as Id<"clients">) : null;
  const client = useQuery(api.clients.get, clientId ? { clientId } : "skip");

  const groups: NavGroup[] = [
    { items: [{ href: "/admin", label: "Panoramica", icon: LayoutDashboard, exact: true }] },
    {
      id: "clienti",
      label: "Clienti",
      items: [{ href: "/admin/clients", label: "Tutti i clienti", icon: Users, exact: !clientId }],
    },
  ];

  if (clientId) {
    const base = `/admin/clients/${clientId}`;
    groups.push({
      id: "cliente-corrente",
      label: client ? `Cliente · ${client.displayName}` : "Cliente",
      items: [
        { href: base, label: "Scheda", icon: UserRound, exact: true },
        { href: `${base}/projects`, label: "Progetti", icon: FolderKanban },
        { href: `${base}/invoices`, label: "Fatture", icon: Receipt },
        { href: `${base}/subscriptions`, label: "Abbonamenti", icon: CreditCard },
        { href: `${base}/documents`, label: "Documenti", icon: FileText },
        { href: `${base}/contracts`, label: "Contratti da inviare", icon: FilePen },
        { href: `${base}/reports`, label: "Report mensili", icon: BarChart3 },
        { href: `${base}/page`, label: "Pagina cliente", icon: LayoutTemplate },
        { href: `${base}/links`, label: "Link di accesso", icon: Link2 },
        { href: `${base}/notifications`, label: "Email inviate", icon: Bell },
      ],
    });
  }

  groups.push(
    {
      id: "lavoro",
      label: "Lavoro e incassi",
      items: [
        { href: "/admin/projects", label: "Progetti", icon: FolderKanban },
        { href: "/admin/invoices", label: "Fatture", icon: Receipt },
        { href: "/admin/subscriptions", label: "Abbonamenti", icon: Repeat },
      ],
    },
    {
      id: "documenti",
      label: "Documenti",
      items: [
        { href: "/admin/templates", label: "Modelli", icon: FileStack },
        { href: "/admin/drafts", label: "Bozze e invii", icon: FilePen },
        { href: "/admin/signatures", label: "Firme dei clienti", icon: PenLine },
        { href: "/admin/brand", label: "Firma e timbro", icon: Stamp },
      ],
    },
    {
      id: "sito",
      label: "Sito core829.net",
      defaultOpen: false,
      items: [
        { href: "/admin/site", label: "Panoramica", icon: Globe, exact: true },
        { href: "/admin/site/messages", label: "Richieste dal sito", icon: Inbox },
        { href: "/admin/site/seo", label: "SEO", icon: SearchCheck },
        { href: "/admin/site/announcement", label: "Avviso in testata", icon: Megaphone },
      ],
    },
    {
      id: "sistema",
      label: "Sistema",
      items: [
        { href: "/admin/notifications", label: "Centro notifiche", icon: Bell },
        { href: "/admin/activity", label: "Registro attività", icon: Activity },
      ],
    },
  );

  return (
    <DashShell
      groups={groups}
      kicker="Area amministrazione"
      toolbar={
        <AdminToolbar
          onSignOut={() => {
            void signOut().then(() => router.replace("/admin/login"));
          }}
        />
      }
      footer={
        <Button
          variant="ghost"
          className="w-full justify-start rounded-full"
          onClick={() => {
            void signOut().then(() => router.replace("/admin/login"));
          }}
        >
          <LogOut aria-hidden /> Esci
        </Button>
      }
    >
      <ErrorBoundary
        fallback={(error, reset) => {
          const code = errorCode(error);
          const expired = code === "UNAUTHENTICATED" || code === "FORBIDDEN";
          return (
            <div role="alert" className="rounded-2xl border border-dashed bg-card p-8 text-center">
              <h1 className="font-display text-lg tracking-tight">{expired ? "Sessione scaduta" : "Non riesco a caricare i dati"}</h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                {expired
                  ? "Accedi di nuovo per continuare."
                  : "Riprova tra un istante. Se l'errore continua, controlla i log di Convex con il comando npx convex logs --prod."}
              </p>
              <div className="mt-4 flex justify-center gap-2">
                {expired ? (
                  <Button onClick={() => router.replace("/admin/login")}>Vai al login</Button>
                ) : (
                  <Button variant="outline" onClick={reset}>
                    Riprova
                  </Button>
                )}
              </div>
            </div>
          );
        }}
      >
        {children}
      </ErrorBoundary>
    </DashShell>
  );
}

/** Cornice dell'area admin: controlla l'accesso e mostra il menu laterale. La sicurezza vera resta nel server. */
export function AdminFrame({ children }: { children: ReactNode }) {
  return (
    <AdminGate>
      <Frame>{children}</Frame>
    </AdminGate>
  );
}
