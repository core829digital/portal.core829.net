"use client";

import { useMutation, useQuery } from "convex/react";
import { Eye, EyeOff } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/errors";
import { formatBytes, formatDate } from "@/lib/format";
import { documentKindLabel } from "@/lib/labels";
import { toast } from "@/lib/toast";

const scanLabel = { pending: "In controllo", clean: "Pulito", rejected: "Respinto" } as const;

export function DocumentsPanel({ clientId }: { clientId: Id<"clients"> }) {
  const documents = useQuery(api.documents.listByClient, { clientId });
  const setVisibility = useMutation(api.documents.setVisibility);

  return (
    <section aria-labelledby="docs-title" className="space-y-4">
      <div>
        <h2 id="docs-title" className="text-lg font-semibold">
          Documenti
        </h2>
        <p className="text-sm text-muted-foreground">
          Il cliente vede solo i documenti <strong>puliti</strong> e <strong>visibili</strong>, dopo aver inserito il codice ricevuto via
          email. Il caricamento dei file, con controllo del contenuto e scansione, arriva nella prossima fase.
        </p>
      </div>
      {documents === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : documents.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nessun documento ancora.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Caricato</TableHead>
                <TableHead>Controllo</TableHead>
                <TableHead className="sr-only">Visibilità</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((d) => (
                <TableRow key={d._id}>
                  <TableCell>
                    <div className="font-medium">{d.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.fileName} · {formatBytes(d.sizeBytes)}
                    </div>
                  </TableCell>
                  <TableCell>{documentKindLabel[d.kind]}</TableCell>
                  <TableCell>{formatDate(d._creationTime)}</TableCell>
                  <TableCell>
                    <Badge variant={d.scanStatus === "clean" ? "default" : d.scanStatus === "rejected" ? "destructive" : "secondary"}>
                      {scanLabel[d.scanStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void setVisibility({ documentId: d._id, visibleToClient: !d.visibleToClient }).catch((e: unknown) => toast.error(errorMessage(e)));
                      }}
                    >
                      {d.visibleToClient ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
                      {d.visibleToClient ? "Visibile" : "Nascosto"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
