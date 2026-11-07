"use client";

import { useQuery } from "convex/react";
import { FilePlus2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { NewDraftDialog } from "@/components/admin/docs/TemplatesPage";
import { PageHeader } from "@/components/dash/DashShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";
import { docCategoryLabel } from "@/lib/labels";

/** Elenco delle bozze e dei documenti inviati. Con `clientId` mostra solo quelli di un cliente. */
export function DraftsList({ clientId }: { clientId?: Id<"clients"> }) {
  const drafts = useQuery(api.docStudio.listDrafts, clientId ? { clientId } : {});
  const [creating, setCreating] = useState(false);

  const newButton = (
    <Button onClick={() => setCreating(true)}>
      <FilePlus2 aria-hidden /> Nuovo documento
    </Button>
  );

  const body =
    drafts === undefined ? (
      <div className="space-y-2" aria-busy="true" aria-label="Caricamento">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    ) : drafts.length === 0 ? (
      <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        Nessun documento ancora. Con «Nuovo documento» parti da un modello oppure da un file Word.
      </p>
    ) : (
      <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10 shadow-(--shadow-soft)">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Documento</TableHead>
              {!clientId ? <TableHead>Cliente</TableHead> : null}
              <TableHead>Tipo</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drafts.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <Link href={`/admin/drafts/${d.id}`} className="font-medium underline-offset-4 hover:underline">
                    {d.name}
                  </Link>
                </TableCell>
                {!clientId ? (
                  <TableCell>
                    <Link href={`/admin/clients/${d.clientId}`} className="underline-offset-4 hover:underline">
                      {d.clientName}
                    </Link>
                  </TableCell>
                ) : null}
                <TableCell>{docCategoryLabel[d.category]}</TableCell>
                <TableCell>
                  <Badge variant={d.status === "sent" ? "default" : "secondary"}>{d.status === "sent" ? "Inviato" : "Bozza"}</Badge>
                  {d.status === "sent" && d.sentTo ? <div className="mt-1 text-xs text-muted-foreground">a {d.sentTo}</div> : null}
                </TableCell>
                <TableCell>{d.sentAt ? formatDateTime(d.sentAt) : formatDate(d.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );

  return (
    <>
      {clientId ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg tracking-tight">Contratti e documenti da inviare</h2>
            {newButton}
          </div>
          {body}
        </div>
      ) : (
        <>
          <PageHeader kicker="Documenti" title="Bozze e invii" description="I documenti che stai preparando per i clienti e quelli già inviati." actions={newButton} />
          {body}
        </>
      )}
      {creating ? <NewDraftDialog clientId={clientId} onClose={() => setCreating(false)} /> : null}
    </>
  );
}
