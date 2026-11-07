"use client";

import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
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
import { intervalLabel, subscriptionStatusLabel } from "@/lib/labels";
import { toast } from "@/lib/toast";

type Subscription = Doc<"subscriptions">;

function CreateSubscriptionDialog({ open, onClose, clientId }: { open: boolean; onClose: () => void; clientId: Id<"clients"> }) {
  const create = useMutation(api.subscriptions.create);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amountCents = parseEuroToCents(String(form.get("amount") ?? ""));
    const startedAt = dateInputToTimestamp(String(form.get("startedAt") ?? ""));
    const renewal = String(form.get("nextRenewalAt") ?? "");
    const nextRenewalAt = renewal === "" ? undefined : (dateInputToTimestamp(renewal) ?? undefined);
    const interval = form.get("interval");
    if (amountCents === null) return void toast.error("Importo non valido. Esempio: 79 oppure 79,00.");
    if (startedAt === null) return void toast.error("Controlla la data di inizio.");
    if (interval !== "month" && interval !== "year") return;
    const description = String(form.get("description") ?? "").trim();
    setPending(true);
    try {
      await create({
        clientId,
        name: String(form.get("name") ?? ""),
        description: description === "" ? undefined : description,
        amountCents,
        interval,
        startedAt,
        nextRenewalAt,
      });
      toast.success("Abbonamento creato.");
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
          <DialogTitle>Nuovo abbonamento</DialogTitle>
          <DialogDescription>Ad esempio hosting, manutenzione o assistenza. Il cliente lo vedrà nel suo spazio.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <TextField id="name" label="Nome" required maxLength={120} placeholder="es. Hosting e assistenza" autoFocus />
          <Field id="description" label="Descrizione" hint="Facoltativa.">
            <Textarea id="description" name="description" maxLength={500} rows={2} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="amount" label="Importo (€)" inputMode="decimal" required placeholder="79,00" />
            <Field id="interval" label="Periodicità">
              <NativeSelect id="interval" name="interval" defaultValue="year">
                <option value="month">Mensile</option>
                <option value="year">Annuale</option>
              </NativeSelect>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="startedAt" label="Inizio" type="date" defaultValue={todayInput()} required />
            <TextField id="nextRenewalAt" label="Prossimo rinnovo" type="date" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creazione…" : "Crea abbonamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SubscriptionsPanel({ clientId }: { clientId: Id<"clients"> }) {
  const subscriptions = useQuery(api.subscriptions.listByClient, { clientId });
  const setStatus = useMutation(api.subscriptions.setStatus);
  const [createOpen, setCreateOpen] = useState(false);
  const [toCancel, setToCancel] = useState<Subscription | null>(null);

  async function apply(subscription: Subscription, status: Subscription["status"]) {
    try {
      await setStatus({ subscriptionId: subscription._id, status });
      toast.success(`${subscription.name}: ${subscriptionStatusLabel[status].toLowerCase()}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section aria-labelledby="subs-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="subs-title" className="text-lg font-semibold">
          Abbonamenti
        </h2>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden /> Nuovo abbonamento
        </Button>
      </div>
      {subscriptions === undefined ? (
        <Skeleton className="h-32 w-full" />
      ) : subscriptions.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nessun abbonamento ancora.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Abbonamento</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead>Prossimo rinnovo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="sr-only">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((s) => (
                <TableRow key={s._id}>
                  <TableCell>
                    <div className="font-medium">{s.name}</div>
                    {s.description ? <div className="text-xs text-muted-foreground">{s.description}</div> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(s.amountCents)} <span className="text-xs text-muted-foreground">{intervalLabel[s.interval]}</span>
                  </TableCell>
                  <TableCell>{formatDate(s.nextRenewalAt)}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === "active" ? "default" : "secondary"}>{subscriptionStatusLabel[s.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      {s.status === "active" ? (
                        <Button size="sm" variant="outline" onClick={() => void apply(s, "paused")}>
                          Metti in pausa
                        </Button>
                      ) : null}
                      {s.status === "paused" ? (
                        <Button size="sm" variant="outline" onClick={() => void apply(s, "active")}>
                          Riattiva
                        </Button>
                      ) : null}
                      {s.status !== "cancelled" ? (
                        <Button size="sm" variant="outline" onClick={() => setToCancel(s)}>
                          Annulla
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {createOpen ? <CreateSubscriptionDialog open clientId={clientId} onClose={() => setCreateOpen(false)} /> : null}
      <ConfirmDialog
        open={toCancel !== null}
        title="Annullare l'abbonamento?"
        description={`«${toCancel?.name ?? ""}» verrà annullato e non sarà più mostrato al cliente. Non si può riattivare: se serve, se ne crea uno nuovo.`}
        confirmLabel="Annulla l'abbonamento"
        destructive
        onCancel={() => setToCancel(null)}
        onConfirm={() => {
          if (toCancel) void apply(toCancel, "cancelled");
          setToCancel(null);
        }}
      />
    </section>
  );
}
