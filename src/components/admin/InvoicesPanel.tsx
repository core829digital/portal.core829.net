"use client";

import { useMutation, useQuery } from "convex/react";
import { Download, FileUp, Plus } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { INVOICE_TRANSITIONS } from "@convex/lib/invoiceFlow";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Field, NativeSelect, TextField } from "@/components/admin/Field";
import { MAX_FILE_BYTES } from "@convex/lib/files";
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
  const subscriptions = useQuery(api.subscriptions.listByClient, { clientId });
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
    const subscriptionId = String(form.get("subscriptionId") ?? "");
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
        subscriptionId: subscriptionId === "" ? undefined : (subscriptionId as Id<"subscriptions">),
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
          <Field id="subscriptionId" label="Abbonamento" hint="Se è la rata di un abbonamento, sceglilo: i due restano collegati e il cliente non riceve doppi avvisi.">
            <NativeSelect id="subscriptionId" name="subscriptionId" defaultValue="">
              <option value="">Nessuno (pagamento singolo)</option>
              {(subscriptions ?? [])
                .filter((x) => x.status !== "cancelled")
                .map((x) => (
                  <option key={x._id} value={x._id}>
                    {x.name} · {formatCents(x.amountCents)}
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

type InvoiceRow = Invoice & { pdfStatus: "pending" | "clean" | "rejected" | "missing" | null };

/** PDF della fattura: carica, apri, stacca. Il file passa dal controllo di sicurezza come ogni documento. */
function InvoicePdfCell({ invoice }: { invoice: InvoiceRow }) {
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const finalize = useMutation(api.documents.finalize);
  const attach = useMutation(api.invoices.attachDocument);
  const url = useQuery(api.documents.adminUrl, invoice.documentId && invoice.pdfStatus === "clean" ? { documentId: invoice.documentId } : "skip");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) return void toast.error("Per la fattura serve un file PDF.");
    if (file.size === 0 || file.size > MAX_FILE_BYTES) return void toast.error(`Il file deve essere un PDF fino a ${MAX_FILE_BYTES / (1024 * 1024)} MB.`);
    setBusy(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: file });
      if (!response.ok) throw new Error("upload");
      const body: unknown = await response.json();
      const storageId = typeof body === "object" && body !== null && "storageId" in body ? (body as { storageId: unknown }).storageId : null;
      if (typeof storageId !== "string") throw new Error("upload");
      // Il cliente lo vede nei Documenti solo se la fattura e' visibile e non e' piu' una bozza.
      const result = await finalize({
        clientId: invoice.clientId,
        storageId: storageId as Id<"_storage">,
        fileName: file.name,
        title: `Fattura ${invoice.number}`,
        kind: "invoice",
        visibleToClient: invoice.visibleToClient && invoice.status !== "draft",
      });
      if (!result.ok) return void toast.error(result.message);
      await attach({ invoiceId: invoice._id, documentId: result.documentId as Id<"documents"> });
      toast.success(`PDF allegato alla fattura ${invoice.number}. Lo stiamo controllando.`);
    } catch (error) {
      toast.error(errorMessage(error, "Caricamento non riuscito. Riprova."));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 text-xs">
      <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-label={`PDF della fattura ${invoice.number}`} onChange={(e) => void onFile(e.target.files?.[0])} />
      {invoice.documentId && invoice.pdfStatus !== "missing" ? (
        <>
          {invoice.pdfStatus === "clean" && url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">
              <Download className="size-3.5" aria-hidden /> Apri PDF
            </a>
          ) : invoice.pdfStatus === "rejected" ? (
            <span className="text-destructive">PDF rifiutato dal controllo</span>
          ) : (
            <span className="text-muted-foreground">PDF in controllo…</span>
          )}
          <span className="flex gap-2 text-muted-foreground">
            <button type="button" className="underline-offset-4 hover:underline disabled:opacity-50" disabled={busy} onClick={() => input.current?.click()}>
              Sostituisci
            </button>
            <button type="button" className="underline-offset-4 hover:underline" onClick={() => void attach({ invoiceId: invoice._id, documentId: null }).then(() => toast.success("PDF staccato (il file resta nei Documenti).")).catch((e: unknown) => toast.error(errorMessage(e)))}>
              Stacca
            </button>
          </span>
        </>
      ) : (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
          <FileUp aria-hidden /> {busy ? "Caricamento…" : "Carica PDF"}
        </Button>
      )}
    </div>
  );
}

export function InvoicesPanel({ clientId }: { clientId: Id<"clients"> }) {
  const invoices = useQuery(api.invoices.listByClient, { clientId });
  const setStatus = useMutation(api.invoices.setStatus);
  const setSubscription = useMutation(api.invoices.setSubscription);
  const applySuggestions = useMutation(api.invoices.applyLinkSuggestions);
  const subscriptions = useQuery(api.subscriptions.listByClient, { clientId });
  const suggestions = useQuery(api.invoices.linkSuggestions, { clientId });
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

  async function link(invoice: Invoice, value: string) {
    try {
      await setSubscription({ invoiceId: invoice._id, subscriptionId: value === "" ? null : (value as Id<"subscriptions">) });
      toast.success(value === "" ? `Fattura ${invoice.number}: scollegata dall'abbonamento.` : `Fattura ${invoice.number}: collegata all'abbonamento.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function linkAll() {
    try {
      const n = await applySuggestions({ clientId });
      toast.success(n === 1 ? "1 fattura collegata." : `${n} fatture collegate.`);
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
      {suggestions && suggestions.length > 0 ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4 text-sm">
          <p>
            {suggestions.length === 1 ? "1 fattura sembra la rata" : `${suggestions.length} fatture sembrano le rate`} di un abbonamento (stesso importo, un solo abbonamento
            possibile):{" "}
            {suggestions.map((x) => `${x.number} → ${x.subscriptionName}`).join(", ")}.
          </p>
          <Button size="sm" onClick={() => void linkAll()}>
            Collega
          </Button>
        </div>
      ) : null}
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
                <TableHead>Abbonamento</TableHead>
                <TableHead>PDF</TableHead>
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
                  <TableCell>
                    <NativeSelect aria-label={`Abbonamento collegato alla fattura ${invoice.number}`} value={invoice.subscriptionId ?? ""} onChange={(e) => void link(invoice, e.target.value)}>
                      <option value="">Nessuno</option>
                      {(subscriptions ?? [])
                        .filter((x) => x.status !== "cancelled" || x._id === invoice.subscriptionId)
                        .map((x) => (
                          <option key={x._id} value={x._id}>
                            {x.name}
                          </option>
                        ))}
                    </NativeSelect>
                  </TableCell>
                  <TableCell>
                    <InvoicePdfCell invoice={invoice as InvoiceRow} />
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
