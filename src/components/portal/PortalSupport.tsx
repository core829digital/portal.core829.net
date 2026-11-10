"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Plus } from "lucide-react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { UnlockGate } from "@/components/portal/PortalDocuments";
import { NewTicketForm, RelatedChips, ReplyBox, Thread, TicketList, TicketStatusBadge, type TicketRow } from "@/components/support/TicketViews";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";

function Conversation({ token, unlockToken, ticketId, onBack }: { token: string; unlockToken: string; ticketId: Id<"tickets">; onBack: () => void }) {
  const ticket = useQuery(api.tickets.portalGet, { token, unlockToken, ticketId });
  const reply = useMutation(api.tickets.portalReply);
  if (ticket === undefined) return <Skeleton className="h-64 w-full rounded-2xl" />;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden /> Tutte le richieste
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">{ticket.subject}</h2>
        <TicketStatusBadge status={ticket.status} side="client" />
      </div>
      <RelatedChips labels={ticket.related} />
      <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 shadow-(--shadow-soft) sm:p-6">
        <Thread messages={ticket.messages} me="client" />
      </div>
      <ReplyBox
        onSend={async (body) => {
          try {
            await reply({ token, unlockToken, ticketId, body });
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </div>
  );
}

function Tickets({ token, unlockToken }: { token: string; unlockToken: string }) {
  const rows = useQuery(api.tickets.portalList, { token, unlockToken });
  const create = useMutation(api.tickets.portalCreate);
  const relatable = useQuery(api.tickets.portalRelatable, { token, unlockToken });
  const [selected, setSelected] = useState<Id<"tickets"> | null>(null);
  const [creating, setCreating] = useState(false);

  if (selected) return <Conversation token={token} unlockToken={unlockToken} ticketId={selected} onBack={() => setSelected(null)} />;
  if (creating) {
    return (
      <NewTicketForm
        onCancel={() => setCreating(false)}
        relatable={relatable}
        onCreate={async (v) => {
          try {
            const { invoiceId, subscriptionId, projectId, ...rest } = v;
            const id = await create({
              token,
              unlockToken,
              ...rest,
              invoiceId: invoiceId as Id<"invoices"> | undefined,
              subscriptionId: subscriptionId as Id<"subscriptions"> | undefined,
              projectId: projectId as Id<"projects"> | undefined,
            });
            toast.success("Richiesta inviata. Ti rispondiamo il prima possibile.");
            setCreating(false);
            setSelected(id);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden /> Nuova richiesta
        </Button>
      </div>
      {rows === undefined ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : (
        <TicketList rows={rows as TicketRow[]} side="client" onSelect={(id) => setSelected(id as Id<"tickets">)} empty="Non hai ancora richieste di assistenza. Quando ti serve aiuto, scrivici da qui." />
      )}
    </div>
  );
}

/** Assistenza: le richieste del cliente, dietro il codice di sblocco (come i documenti). */
export function PortalSupport({ token }: { token: string }) {
  return (
    <UnlockGate token={token} heading="Le tue richieste" intro="Per proteggere la tua privacy, le richieste di assistenza si aprono con un codice che ti mandiamo via email." submitLabel="Apri le richieste">
      {(unlockToken) => <Tickets token={token} unlockToken={unlockToken} />}
    </UnlockGate>
  );
}
