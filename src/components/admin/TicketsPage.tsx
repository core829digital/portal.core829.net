"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/dash/DashShell";
import { CATEGORY_LABEL, RelatedChips, ReplyBox, STATUS_LABEL, Thread, TicketList, TicketStatusBadge, type TicketRow, type TicketStatus } from "@/components/support/TicketViews";
import { NativeSelect } from "@/components/admin/Field";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";

const FILTERS: { value: TicketStatus | "all"; label: string }[] = [
  { value: "open", label: "Da rispondere" },
  { value: "waiting_client", label: "In attesa del cliente" },
  { value: "in_progress", label: "In lavorazione" },
  { value: "closed", label: "Chiuse" },
  { value: "all", label: "Tutte" },
];

function Detail({ ticketId, onBack }: { ticketId: Id<"tickets">; onBack: () => void }) {
  const ticket = useQuery(api.tickets.get, { ticketId });
  const reply = useMutation(api.tickets.reply);
  const setStatus = useMutation(api.tickets.setStatus);
  const setLinks = useMutation(api.tickets.setLinks);
  const clientId = ticket?.clientId;
  const invoices = useQuery(api.invoices.listByClient, clientId ? { clientId } : "skip");
  const subscriptions = useQuery(api.subscriptions.listByClient, clientId ? { clientId } : "skip");
  const projects = useQuery(api.projects.listByClient, clientId ? { clientId } : "skip");
  if (ticket === undefined) return <Skeleton className="h-72 w-full rounded-2xl" />;
  if (ticket === null) return <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Ticket non trovato.</p>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden /> Tutti i ticket
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold tracking-tight">{ticket.subject}</h2>
          <p className="truncate text-xs text-muted-foreground">
            <Link href={`/admin/clients/${ticket.clientId}`} className="underline underline-offset-4">
              {ticket.clientName}
            </Link>{" "}
            · {ticket.clientEmail} · {CATEGORY_LABEL[ticket.category]}
          </p>
        </div>
        <TicketStatusBadge status={ticket.status} side="admin" />
        <label className="sr-only" htmlFor="ticket-status">
          Stato del ticket
        </label>
        <NativeSelect id="ticket-status" className="w-44" value={ticket.status} onChange={(e) => void setStatus({ ticketId, status: e.target.value as TicketStatus }).catch((err: unknown) => toast.error(errorMessage(err)))}>
          {(Object.keys(STATUS_LABEL.admin) as TicketStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL.admin[s]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 shadow-(--shadow-soft)">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Riguarda</span>
          <RelatedChips labels={ticket.related.map((r) => r.label)} />
          {ticket.related.length === 0 ? <span className="text-muted-foreground">nulla di collegato</span> : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["invoiceId", "Fattura", ticket.invoiceId, (invoices ?? []).map((x) => ({ id: x._id as string, label: `${x.number} · ${x.status}` }))],
              ["subscriptionId", "Abbonamento", ticket.subscriptionId, (subscriptions ?? []).map((x) => ({ id: x._id as string, label: x.name }))],
              ["projectId", "Progetto", ticket.projectId, (projects ?? []).map((x) => ({ id: x._id as string, label: x.name }))],
            ] as const
          ).map(([key, label, current, options]) => (
            <div key={key}>
              <label htmlFor={`link-${key}`} className="mb-1 block text-xs text-muted-foreground">
                {label}
              </label>
              <NativeSelect
                id={`link-${key}`}
                value={current ?? ""}
                onChange={(e) => {
                  const next = { invoiceId: ticket.invoiceId, subscriptionId: ticket.subscriptionId, projectId: ticket.projectId, [key]: e.target.value === "" ? null : e.target.value };
                  void setLinks({ ticketId, ...next } as never).catch((err: unknown) => toast.error(errorMessage(err)));
                }}
              >
                <option value="">Nessuno</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 shadow-(--shadow-soft) sm:p-6">
        <Thread messages={ticket.messages} me="admin" />
      </div>
      <ReplyBox
        canClose
        onSend={async (body, close) => {
          try {
            await reply({ ticketId, body, close });
            toast.success(close ? "Risposta inviata e ticket chiuso." : "Risposta inviata al cliente.");
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </div>
  );
}

/** Ticket di assistenza dei clienti: coda, conversazione, risposta e stato. */
export function TicketsPage() {
  const [filter, setFilter] = useState<TicketStatus | "all">("open");
  const [selected, setSelected] = useState<Id<"tickets"> | null>(null);
  const rows = useQuery(api.tickets.list, filter === "all" ? {} : { status: filter });
  return (
    <>
      <PageHeader kicker="Clienti" title="Ticket di assistenza" description="Le richieste che i clienti ci scrivono dal portale. Rispondere invia una email al cliente; lui ti risponde dal suo spazio." />
      {selected ? (
        <Detail ticketId={selected} onBack={() => setSelected(null)} />
      ) : (
        <>
          <div role="group" aria-label="Stato" className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)} className="h-8 rounded-full border px-3 text-[0.8rem] font-medium hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary">
                {f.label}
              </button>
            ))}
          </div>
          {rows === undefined ? (
            <Skeleton className="h-40 w-full rounded-2xl" />
          ) : (
            <TicketList
              rows={rows as TicketRow[]}
              side="admin"
              onSelect={(id) => setSelected(id as Id<"tickets">)}
              empty={
                <>
                  <LifeBuoy aria-hidden className="mx-auto mb-2 size-5" /> Nessun ticket con questo stato.
                </>
              }
            />
          )}
        </>
      )}
    </>
  );
}
