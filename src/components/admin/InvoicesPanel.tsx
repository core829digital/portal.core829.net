"use client";

import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { INVOICE_TRANSITIONS } from "@convex/lib/invoiceFlow";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Field, NativeSelect, TextField } from "@/components/admin/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { dateInputToTimestamp, formatCents, formatDate, parseEuroToCents, todayInput } from "@/lib/format";
import { invoiceStatusLabel } from "@/lib/labels";
import { toast } from "@/lib/toast";

type Invoice = Doc<"invoices">;
type InvoiceStatus = Invoice["status"];

// "Scaduta" la imposta da sola il sistema: non e' un'azione manuale.
const ACTION_LABEL: Partial<Record<InvoiceStatus, string>> = {
  sent: "Segna come inviata",
  paid: "Segna come pagata",
  cancelled: "Annulla",
};

function statusVariant(status: InvoiceStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "paid") return "default";
  if (status === "overdue") return "destructive";
  if (status === "cancelled" || status === "draft") return "outline";
  return "secondary";
}

function CreateInvoiceDialog({ open, onClose, clientId }: { open: boolean; onClose: () => void; clientId: Id<"clients"> }) {
  const create = useMutation(api.invoices.create);
  const projects = useQuery(api.projects.listByClient, { clientId });
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amountCents = parseEuroToCents(String(form.get("amount") ?? ""));
    const issuedAt = dateInputToTimestamp(String(form.get("issuedAt") ?? ""));
    const dueAt = dateInputToTimestamp(String(form.get("dueAt") ?? ""));
    if (amountCents === null) return void toast.error("Importo non valido. Esempio: 390 oppure 390,50.");
    if (issuedAt === null || dueAt === null) return void toast.error("Controlla le date.");
    const projectId = String(form.get("projectId") ?? "");
    const note = String(form.get("note") ?? "").trim();
    setPending(true);
    try {
      await create({
        clientId,
        number: String(form.get("number") ?? ""),
        issuedAt,
        dueAt,
        amountCents,
        projectId: projectId === "" ? undefined : (projectId as Id<"projects">),
        note: note === "" ? undefined : note,
        visibleToClient: form.get("visibleToClient") === "on",
      });
      toast.success("Fattura creata come bozza.");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuova fattura</DialogTitle>
          <DialogDescription>
            Si crea come bozza: il cliente non la vede finché non la segni come inviata. La fattura vera si emette dal tuo sistema di
            fatturazione; qui si registra importo e scadenza.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <TextField id="number" label="Numero fattura" required maxLength={40} placeholder="es. 2026/014" autoFocus />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="issuedAt" label="Emissione" type="date" defaultValue={todayInput()} required />
            <TextField id="dueAt" label="Scadenza" type="date" defaultValue={todayInput(30)} required />
          </div>
          <TextField id="amount" label="Importo (€)" inputMode="decimal" required placeholder="390,00" hint="Imposta gli importi come li vede il cliente, IVA compresa se applicabile." />
          <Field id="projectId" label="Progetto" hint="Facoltativo.">
            <NativeSelect id="projectId" name="projectId" defaultValue="">
              <option value="">Nessuno</option>
              {(projects ?? []).map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="note" label="Nota per il cliente" hint="Es. causale. Facoltativa.">
            <Textarea id="note" name="note" maxLength={500} rows={2} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="visibleToClient" defaultChecked className="size-4" />
            Visibile al cliente quando inviata
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creazione…" : "Crea bozza"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InvoicesPanel({ clientId }: { clientId: Id<"clients"> }) {
  const invoices = useQuery(api.invoices.listByClient, { clientId });
  const setStatus = useMutation(api.invoices.setStatus);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ invoice: Invoice; status: InvoiceStatus } | null>(null);

  async function applyStatus(invoice: Invoice, status: InvoiceStatus) {
    try {
      await setStatus({ invoiceId: invoice._id, status });
      toast.success(`Fattura ${invoice.number}: ${invoiceStatusLabel[status].toLowerCase()}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section aria-labelledby="invoices-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="invoices-title" className="text-lg font-semibold">
          Fatture
        </h2>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden /> Nuova fattura
        </Button>
      </div>
      {invoices === undefined ? (
        <Skeleton className="h-32 w-full" />
      ) : invoices.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nessuna fattura ancora.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numero</TableHead>
                <TableHead>Emessa</TableHead>
                <TableHead>Scadenza</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="sr-only">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice._id}>
                  <TableCell className="font-medium">
                    {invoice.number}
                    {!invoice.visibleToClient ? <div className="text-xs font-normal text-muted-foreground">Nascosta al cliente</div> : null}
                  </TableCell>
                  <TableCell>{formatDate(invoice.issuedAt)}</TableCell>
                  <TableCell>{formatDate(invoice.dueAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(invoice.amountCents)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(invoice.status)}>{invoiceStatusLabel[invoice.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      {INVOICE_TRANSITIONS[invoice.status]
                        .filter((next) => ACTION_LABEL[next] !== undefined)
                        .map((next) => (
                          <Button
                            key={next}
                            size="sm"
                            variant={next === "cancelled" ? "outline" : "default"}
                            onClick={() => (next === "sent" ? void applyStatus(invoice, next) : setConfirm({ invoice, status: next }))}
                          >
                            {ACTION_LABEL[next]}
                          </Button>
                        ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {createOpen ? <CreateInvoiceDialog open clientId={clientId} onClose={() => setCreateOpen(false)} /> : null}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.status === "paid" ? "Segnare come pagata?" : "Annullare la fattura?"}
        description={
          confirm?.status === "paid"
            ? `La fattura ${confirm.invoice.number} risulterà pagata oggi. Non si potrà più modificare.`
            : `La fattura ${confirm?.invoice.number ?? ""} verrà annullata e non sarà più visibile al cliente. Non si potrà più modificare.`
        }
        confirmLabel={confirm?.status === "paid" ? "Segna come pagata" : "Annulla la fattura"}
        destructive={confirm?.status === "cancelled"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) void applyStatus(confirm.invoice, confirm.status);
          setConfirm(null);
        }}
      />
    </section>
  );
}
