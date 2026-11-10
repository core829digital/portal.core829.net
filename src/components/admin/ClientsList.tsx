"use client";

import { useConvex, usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import { CreateClientDialog } from "@/components/admin/CreateClientDialog";
import { NativeSelect } from "@/components/admin/Field";
import { PageHeader } from "@/components/dash/DashShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "@/lib/toast";
import { errorMessage } from "@/lib/errors";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { clientStatusLabel, packageLabel } from "@/lib/labels";

type StatusFilter = keyof typeof clientStatusLabel | "all";

/** Scarica un file con tutti i dati per il CRM (b2b.core829.net → Data → Import from portal). */
function ExportForCrmButton() {
  const convex = useConvex();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const data = await convex.query(api.crmExport.snapshot, {});
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `portale-per-crm-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(data.truncated ? "File scaricato, ma incompleto: troppi dati." : `File scaricato: ${data.clients.length} clienti. Caricalo nel CRM (Data → Import from portal).`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" onClick={() => void run()} disabled={busy}>
      <Download aria-hidden /> {busy ? "Preparazione…" : "Esporta per il CRM"}
    </Button>
  );
}

export function ClientsList() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const { results, status: loadStatus, loadMore } = usePaginatedQuery(
    api.clients.list,
    status === "all" ? {} : { status },
    { initialNumItems: 25 },
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return results;
    return results.filter((c) => [c.displayName, c.contactName, c.email].some((v) => v.toLowerCase().includes(q)));
  }, [results, search]);

  return (
    <>
      <PageHeader kicker="Clienti" title="Tutti i clienti" description="Apri un cliente per vedere progetti, fatture, abbonamenti, documenti e link." actions={<div className="flex flex-wrap gap-2"><ExportForCrmButton /><CreateClientDialog /></div>} />

      <div className="flex flex-wrap gap-3">
        <Input
          type="search"
          placeholder="Cerca per nome o email"
          aria-label="Cerca clienti"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <NativeSelect
          aria-label="Filtra per stato"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="max-w-44"
        >
          <option value="all">Tutti gli stati</option>
          {Object.entries(clientStatusLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {loadStatus === "LoadingFirstPage" ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          {results.length === 0 ? "Nessun cliente ancora. Crea il primo con «Nuovo cliente»." : "Nessun cliente corrisponde alla ricerca."}
        </p>
      ) : (
        <div className="reveal overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10 shadow-(--shadow-soft)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Attività</TableHead>
                <TableHead>Referente</TableHead>
                <TableHead>Pacchetto</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Creato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((client) => (
                <TableRow key={client._id}>
                  <TableCell>
                    <Link href={`/admin/clients/${client._id}`} className="font-medium underline-offset-4 hover:underline">
                      {client.displayName}
                    </Link>
                    <div className="text-xs text-muted-foreground">{client.email}</div>
                  </TableCell>
                  <TableCell>{client.contactName}</TableCell>
                  <TableCell>{packageLabel[client.packageType]}</TableCell>
                  <TableCell>
                    <Badge variant={client.status === "active" ? "default" : "secondary"}>{clientStatusLabel[client.status]}</Badge>
                  </TableCell>
                  <TableCell>{formatDate(client._creationTime)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {loadStatus === "CanLoadMore" ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => loadMore(25)}>
            Carica altri
          </Button>
        </div>
      ) : null}
    </>
  );
}
