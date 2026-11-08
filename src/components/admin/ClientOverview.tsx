"use client";

import { useMutation } from "convex/react";
import { Pencil } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { Field, NativeSelect, TextField } from "@/components/admin/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { clientStatusLabel, packageLabel } from "@/lib/labels";

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm">{value && value !== "" ? value : "—"}</dd>
    </div>
  );
}

function nullable(form: FormData, name: string): string | null {
  const v = String(form.get(name) ?? "").trim();
  return v === "" ? null : v;
}

export function ClientOverview({ client }: { client: Doc<"clients"> }) {
  const updateClient = useMutation(api.clients.update);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const status = form.get("status");
    const packageType = form.get("packageType");
    if (
      (status !== "onboarding" && status !== "active" && status !== "paused" && status !== "closed") ||
      (packageType !== "standard" && packageType !== "advanced" && packageType !== "custom")
    ) {
      return;
    }
    setPending(true);
    try {
      await updateClient({
        clientId: client._id,
        displayName: String(form.get("displayName") ?? ""),
        contactName: String(form.get("contactName") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: nullable(form, "phone"),
        vatId: nullable(form, "vatId"),
        address: nullable(form, "address"),
        pec: nullable(form, "pec"),
        legalRep: nullable(form, "legalRep"),
        website: nullable(form, "website"),
        status,
        packageType,
        notifyEmail: form.get("notifyEmail") === "on",
        welcomeMessage: nullable(form, "welcomeMessage"),
        internalNotes: nullable(form, "internalNotes"),
      });
      toast.success("Cliente aggiornato.");
      setOpen(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Dati del cliente</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Pencil aria-hidden /> Modifica
        </Button>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3">
          <Row label="Referente" value={client.contactName} />
          <Row label="Email" value={client.email} />
          <Row label="Telefono" value={client.phone} />
          <Row label="Partita IVA" value={client.vatId} />
          <Row label="Sede legale" value={client.address} />
          <Row label="PEC" value={client.pec} />
          <Row label="Rappresentante legale" value={client.legalRep} />
          <Row label="Sito web" value={client.website} />
          <Row label="Pacchetto" value={packageLabel[client.packageType]} />
          <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-sm text-muted-foreground">Stato</dt>
            <dd>
              <Badge variant={client.status === "active" ? "default" : "secondary"}>{clientStatusLabel[client.status]}</Badge>
            </dd>
          </div>
          <Row label="Email automatiche" value={client.notifyEmail === false ? "Disattivate" : "Attive"} />
          <Row label="Cliente dal" value={formatDate(client._creationTime)} />
          <Row label="Messaggio di benvenuto" value={client.welcomeMessage} />
          <Row label="Note interne (private)" value={client.internalNotes} />
        </dl>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifica cliente</DialogTitle>
            <DialogDescription>Le note interne non sono mai visibili al cliente.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            <TextField id="displayName" label="Nome dell'attività" defaultValue={client.displayName} required maxLength={120} />
            <TextField id="contactName" label="Referente" defaultValue={client.contactName} required maxLength={120} />
            <TextField id="email" label="Email" type="email" defaultValue={client.email} required maxLength={254} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField id="phone" label="Telefono" type="tel" defaultValue={client.phone ?? ""} maxLength={20} />
              <TextField id="vatId" label="Partita IVA" defaultValue={client.vatId ?? ""} maxLength={32} />
            </div>
            <TextField id="address" label="Sede legale / residenza" defaultValue={client.address ?? ""} maxLength={200} hint="Serve a compilare in automatico contratti e documenti." />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField id="pec" label="PEC" type="email" defaultValue={client.pec ?? ""} maxLength={254} />
              <TextField id="legalRep" label="Rappresentante legale" defaultValue={client.legalRep ?? ""} maxLength={120} placeholder="Nome e carica" />
            </div>
            <TextField id="website" label="Sito web" defaultValue={client.website ?? ""} maxLength={200} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="status" label="Stato">
                <NativeSelect id="status" name="status" defaultValue={client.status}>
                  {Object.entries(clientStatusLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="packageType" label="Pacchetto">
                <NativeSelect id="packageType" name="packageType" defaultValue={client.packageType}>
                  {Object.entries(packageLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="notifyEmail" defaultChecked={client.notifyEmail !== false} className="mt-1 size-4 accent-primary" />
              <span>
                <span className="font-medium">Invia a questo cliente le email automatiche</span>
                <span className="block text-muted-foreground">Fatture, documenti, report, richieste di firma. Le risposte alle sue richieste partono comunque a mano.</span>
              </span>
            </label>
            <Field id="welcomeMessage" label="Messaggio di benvenuto" hint="Visibile al cliente.">
              <Textarea id="welcomeMessage" name="welcomeMessage" defaultValue={client.welcomeMessage ?? ""} maxLength={1000} rows={3} />
            </Field>
            <Field id="internalNotes" label="Note interne" hint="Solo per te.">
              <Textarea id="internalNotes" name="internalNotes" defaultValue={client.internalNotes ?? ""} maxLength={4000} rows={3} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvataggio…" : "Salva"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
