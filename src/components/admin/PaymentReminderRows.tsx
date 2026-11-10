"use client";

import { Receipt, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCents, formatDate } from "@/lib/format";

export type ReminderClient = {
  clientId: string;
  name: string;
  email: string;
  notifyEmail: boolean;
  items: { key: string; kind: "invoice" | "subscription"; label: string; dueAt: number; amountCents: number }[];
  totalCents: number;
};

/** Elenco dei clienti che riceverebbero il promemoria, con le loro scadenze e una casella per sceglierli. */
export function PaymentReminderRows({ clients, selected, onToggle }: { clients: ReminderClient[]; selected: Set<string>; onToggle: (clientId: string) => void }) {
  return (
    <ul className="stagger divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 shadow-(--shadow-soft)" aria-label="Clienti con scadenze">
      {clients.map((c) => {
        const id = `rem-${c.clientId}`;
        return (
          <li key={c.clientId} className="flex gap-3 px-4 py-3.5">
            <input id={id} type="checkbox" className="mt-1 size-4 accent-primary" checked={selected.has(c.clientId)} disabled={!c.notifyEmail} onChange={() => onToggle(c.clientId)} />
            <div className="min-w-0 flex-1">
              <label htmlFor={id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                {c.name}
                <span className="text-xs font-normal text-muted-foreground">{c.email}</span>
                {c.notifyEmail ? null : <Badge variant="outline">Escluso dalle email</Badge>}
              </label>
              <ul className="mt-1.5 space-y-1">
                {c.items.map((i) => (
                  <li key={i.key} className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {i.kind === "invoice" ? <Receipt aria-hidden className="size-3.5" /> : <Repeat aria-hidden className="size-3.5" />}
                    <span className="text-foreground">{i.label}</span>
                    <span className="tabular-nums">· scade il {formatDate(i.dueAt)}</span>
                    <span className="tabular-nums">· {formatCents(i.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCents(c.totalCents)}</span>
          </li>
        );
      })}
    </ul>
  );
}
