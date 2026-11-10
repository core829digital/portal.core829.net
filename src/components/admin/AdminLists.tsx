"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { api } from "@convex/_generated/api";
import { NativeSelect } from "@/components/admin/Field";
import { ProgressBar } from "@/components/ProgressBar";
import { PageHeader } from "@/components/dash/DashShell";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents, formatDate, formatDateTime } from "@/lib/format";
import {
  auditActionLabel,
  intervalLabel,
  invoiceStatusLabel,
  projectStatusLabel,
  subscriptionStatusLabel,
} from "@/lib/labels";

function Loading() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Caricamento">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function Card({ children }: { children: ReactNode }) {
  return <div className="reveal overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10 shadow-(--shadow-soft)">{children}</div>;
}

function ClientLink({ id, name }: { id: string; name: string }) {
  return (
    <Link href={`/admin/clients/${id}`} className="font-medium underline-offset-4 hover:underline">
      {name}
    </Link>
  );
}

type InvoiceStatus = keyof typeof invoiceStatusLabel;

export function InvoicesOverview() {
  const [status, setStatus] = useState<InvoiceStatus | "all">("all");
  const rows = useQuery(api.dashboard.invoices, status === "all" ? {} : { status });
  return (
    <>
      <PageHeader
        kicker="Gestione"
        title="Fatture"
        description="Tutte le fatture di tutti i clienti. Per crearne una o cambiarne lo stato apri la scheda del cliente."
        actions={
          <NativeSelect aria-label="Filtra per stato" value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus | "all")} className="w-44">
            <option value="all">Tutti gli stati</option>
            {Object.entries(invoiceStatusLabel).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        }
      />
      {rows === undefined ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>Nessuna fattura con questo stato.</Empty>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numero</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Abbonamento</TableHead>
                <TableHead>Emessa</TableHead>
                <TableHead>Scadenza</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead>Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.number}</TableCell>
                  <TableCell>
                    <ClientLink id={i.clientId} name={i.clientName} />
                  </TableCell>
                  <TableCell>{i.subscriptionName ?? <span className="text-xs text-muted-foreground">Singolo</span>}</TableCell>
                  <TableCell>{formatDate(i.issuedAt)}</TableCell>
                  <TableCell>{formatDate(i.dueAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(i.amountCents)}</TableCell>
                  <TableCell>
                    <Badge variant={i.status === "paid" ? "default" : i.status === "overdue" ? "destructive" : "secondary"}>{invoiceStatusLabel[i.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}

type SubStatus = keyof typeof subscriptionStatusLabel;

export function SubscriptionsOverview() {
  const [status, setStatus] = useState<SubStatus | "all">("all");
  const rows = useQuery(api.dashboard.subscriptions, status === "all" ? {} : { status });
  return (
    <>
      <PageHeader
        kicker="Gestione"
        title="Abbonamenti"
        description="Ricavi ricorrenti di tutti i clienti. Il promemoria di pagamento parte da solo il giorno prima della scadenza, alle 10:30."
        actions={
          <NativeSelect aria-label="Filtra per stato" value={status} onChange={(e) => setStatus(e.target.value as SubStatus | "all")} className="w-44">
            <option value="all">Tutti gli stati</option>
            {Object.entries(subscriptionStatusLabel).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        }
      />
      {rows === undefined ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>Nessun abbonamento con questo stato.</Empty>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Abbonamento</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead>Prossimo rinnovo</TableHead>
                <TableHead>Fatture collegate</TableHead>
                <TableHead>Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>
                    <ClientLink id={s.clientId} name={s.clientName} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(s.amountCents)} <span className="text-xs text-muted-foreground">{intervalLabel[s.interval]}</span>
                  </TableCell>
                  <TableCell>{formatDate(s.nextRenewalAt)}</TableCell>
                  <TableCell className="text-sm">
                    {s.linkedInvoices === 0 ? <span className="text-xs text-muted-foreground">Nessuna</span> : `${s.linkedInvoices}${s.openInvoices > 0 ? ` · ${s.openInvoices} da saldare` : " · saldate"}`}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.status === "active" ? "default" : "secondary"}>{subscriptionStatusLabel[s.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}

type ProjectStatus = keyof typeof projectStatusLabel;

export function ProjectsOverview() {
  const [status, setStatus] = useState<ProjectStatus | "all">("all");
  const rows = useQuery(api.dashboard.projects, status === "all" ? {} : { status });
  return (
    <>
      <PageHeader
        kicker="Gestione"
        title="Progetti"
        description="Stato di avanzamento di tutti i progetti."
        actions={
          <NativeSelect aria-label="Filtra per stato" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | "all")} className="w-44">
            <option value="all">Tutti gli stati</option>
            {Object.entries(projectStatusLabel).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        }
      />
      {rows === undefined ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>Nessun progetto con questo stato.</Empty>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Progetto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="min-w-40">Avanzamento</TableHead>
                <TableHead>Consegna</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <ClientLink id={p.clientId} name={p.clientName} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.status === "completed" ? "default" : "secondary"}>{projectStatusLabel[p.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    <ProgressBar value={p.progress} />
                  </TableCell>
                  <TableCell>{formatDate(p.dueDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}

export function ActivityOverview() {
  const rows = useQuery(api.dashboard.activity, {});
  return (
    <>
      <PageHeader kicker="Gestione" title="Attività" description="Le ultime operazioni registrate: chi ha fatto cosa e quando. Non contiene mai codici o link." />
      {rows === undefined ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>Nessuna attività registrata.</Empty>
      ) : (
        <Card>
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{auditActionLabel[r.action] ?? r.action}</span>
                  {r.clientName ? <span className="text-muted-foreground"> · {r.clientName}</span> : null}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider">
                    {r.actorType === "admin" ? "Tu" : r.actorType === "client" ? "Cliente" : "Sistema"}
                  </span>
                  <time dateTime={new Date(r.at).toISOString()}>{formatDateTime(r.at)}</time>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
