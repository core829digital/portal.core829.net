"use client";

import { useMutation, useQuery } from "convex/react";
import { Download, PenLine, Undo2 } from "lucide-react";
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
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";

const LABEL = { pending: "In attesa", signed: "Firmato", revoked: "Annullata", expired: "Scaduta" } as const;

function SignedDownload({ documentId }: { documentId: Id<"documents"> }) {
  const url = useQuery(api.documents.adminUrl, { documentId });
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[0.8rem] font-medium hover:bg-muted">
      <Download className="size-3.5" aria-hidden /> Copia firmata
    </a>
  );
}

/** Richieste di firma elettronica: chi deve firmare, chi ha firmato (con data e IP come prova). */
export function SignaturesPage() {
  const rows = useQuery(api.signatures.list, {});
  const revoke = useMutation(api.signatures.revoke);
  const [toRevoke, setToRevoke] = useState<{ id: Id<"signatureRequests">; title: string } | null>(null);

  return (
    <>
      <PageHeader kicker="Documenti" title="Firme dei clienti" description="Le richieste di firma elettronica inviate e il loro stato. Per chiederne una nuova: Bozze e invii → «Chiedi al cliente di firmare», oppure Documenti del cliente → «Richiedi firma»." />
      {rows === undefined ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          <PenLine aria-hidden className="mx-auto mb-2 size-5" /> Nessuna richiesta di firma ancora.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10 shadow-(--shadow-soft)">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Documento</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Stato</th>
                <th className="px-4 py-2 font-medium">Dettagli</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-56 truncate px-4 py-3 font-medium">{r.title}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/clients/${r.clientId}/documents`} className="underline-offset-4 hover:underline">
                      {r.clientName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={r.status === "signed" ? "default" : "secondary"}>{LABEL[r.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.status === "signed" ? `${r.signedName} · ${formatDateTime(r.signedAt)} · IP ${r.ip}` : r.status === "pending" ? `scade il ${formatDateTime(r.expiresAt)}` : `richiesta il ${formatDateTime(r.createdAt)}`}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {r.signedDocumentId ? <SignedDownload documentId={r.signedDocumentId} /> : null}
                      {r.status === "pending" ? (
                        <Button size="sm" variant="ghost" onClick={() => setToRevoke({ id: r.id, title: r.title })}>
                          <Undo2 aria-hidden /> Annulla
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={toRevoke !== null}
        title="Annullare la richiesta di firma?"
        description={`Il cliente non potrà più firmare «${toRevoke?.title ?? ""}» con questa richiesta. Puoi inviarne una nuova.`}
        confirmLabel="Annulla la richiesta"
        destructive
        onCancel={() => setToRevoke(null)}
        onConfirm={() => {
          const r = toRevoke;
          setToRevoke(null);
          if (r) void revoke({ requestId: r.id }).then(() => toast.success("Richiesta annullata.")).catch((e: unknown) => toast.error(errorMessage(e)));
        }}
      />
    </>
  );
}
