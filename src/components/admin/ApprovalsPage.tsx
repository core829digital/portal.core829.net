"use client";

import { useMutation, useQuery } from "convex/react";
import { CircleCheck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { PageHeader } from "@/components/dash/DashShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";

const LABEL = { pending: "In attesa", approved: "Approvato", changes_requested: "Modifiche richieste", revoked: "Annullata", expired: "Scaduta" } as const;
const VARIANT = { pending: "secondary", approved: "default", changes_requested: "destructive", revoked: "outline", expired: "outline" } as const;

/** Approvazioni chieste ai clienti: chi ha approvato, chi chiede modifiche (con il commento), cosa è in attesa. */
export function ApprovalsPage() {
  const [nowMs] = useState(() => Math.floor(Date.now() / 3_600_000) * 3_600_000);
  const rows = useQuery(api.approvals.list, { nowMs });
  const revoke = useMutation(api.approvals.revoke);
  const [toRevoke, setToRevoke] = useState<{ id: Id<"approvalRequests">; title: string } | null>(null);
  return (
    <>
      <PageHeader kicker="Documenti" title="Approvazioni dei clienti" description="I documenti che hai chiesto di approvare e le risposte. Per chiederne una: scheda cliente → Documenti → «Richiedi approvazione»." />
      {rows === undefined ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          <CircleCheck aria-hidden className="mx-auto mb-2 size-5" /> Nessuna richiesta di approvazione ancora.
        </p>
      ) : (
        <ul className="stagger divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 shadow-(--shadow-soft)">
          {rows.map((r) => (
            <li key={r.id} className="space-y-1.5 px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Badge variant={VARIANT[r.status]}>{LABEL[r.status]}</Badge>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.title}</span>
                <Link href={`/admin/clients/${r.clientId}/documents`} className="text-xs text-muted-foreground underline underline-offset-4">
                  {r.clientName}
                </Link>
                <span className="text-xs text-muted-foreground tabular-nums">{r.decidedAt ? `${r.decidedName} · ${formatDateTime(r.decidedAt)}` : `scade il ${formatDate(r.expiresAt)}`}</span>
                {r.status === "pending" ? (
                  <Button size="sm" variant="outline" onClick={() => setToRevoke({ id: r.id, title: r.title })}>
                    <Undo2 aria-hidden /> Annulla
                  </Button>
                ) : null}
              </div>
              {r.comment ? <p className="whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-sm">{r.comment}</p> : null}
            </li>
          ))}
        </ul>
      )}
      {toRevoke ? (
        <ConfirmDialog
          open
          title="Annullare la richiesta?"
          description={`Il cliente non potrà più approvare «${toRevoke.title}». Potrai inviarne una nuova.`}
          confirmLabel="Annulla la richiesta"
          onCancel={() => setToRevoke(null)}
          onConfirm={async () => {
            try {
              await revoke({ requestId: toRevoke.id });
              toast.success("Richiesta annullata.");
            } catch (e) {
              toast.error(errorMessage(e));
            }
            setToRevoke(null);
          }}
        />
      ) : null}
    </>
  );
}
