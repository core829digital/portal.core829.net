"use client";

import { useMutation } from "convex/react";
import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { api } from "@convex/_generated/api";
import { Field, NativeSelect, TextField } from "@/components/admin/Field";
import { Button } from "@/components/ui/button";
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
import { packageLabel } from "@/lib/labels";

function optional(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function CreateClientDialog() {
  const router = useRouter();
  const createClient = useMutation(api.clients.create);
  // Aperto da «Crea → Nuovo cliente» (barra in alto): /admin/clients?nuovo=1
  const [open, setOpen] = useState(useSearchParams().get("nuovo") === "1");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const packageType = form.get("packageType");
    if (packageType !== "standard" && packageType !== "advanced" && packageType !== "custom") return;
    setPending(true);
    try {
      const clientId = await createClient({
        displayName: String(form.get("displayName") ?? ""),
        contactName: String(form.get("contactName") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: optional(form, "phone"),
        vatId: optional(form, "vatId"),
        address: optional(form, "address"),
        pec: optional(form, "pec"),
        legalRep: optional(form, "legalRep"),
        website: optional(form, "website"),
        packageType,
        welcomeMessage: optional(form, "welcomeMessage"),
      });
      toast.success("Cliente creato.");
      setOpen(false);
      router.push(`/admin/clients/${clientId}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Nuovo cliente
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuovo cliente</DialogTitle>
            <DialogDescription>Dopo la creazione potrai aggiungere progetti, fatture e il link di accesso.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            <TextField id="displayName" label="Nome dell'attività" required maxLength={120} autoFocus />
            <TextField id="contactName" label="Referente" required maxLength={120} />
            <TextField id="email" label="Email" type="email" required maxLength={254} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField id="phone" label="Telefono" type="tel" maxLength={20} />
              <TextField id="vatId" label="Partita IVA" maxLength={32} />
            </div>
            <TextField id="address" label="Sede legale / residenza" maxLength={200} hint="Serve a compilare in automatico contratti e documenti." />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField id="pec" label="PEC" type="email" maxLength={254} />
              <TextField id="legalRep" label="Rappresentante legale" maxLength={120} placeholder="Nome e carica" />
            </div>
            <TextField id="website" label="Sito web" maxLength={200} />
            <Field id="packageType" label="Pacchetto">
              <NativeSelect id="packageType" name="packageType" defaultValue="standard">
                {Object.entries(packageLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="welcomeMessage" label="Messaggio di benvenuto" hint="Lo vedrà il cliente nella sua pagina. Facoltativo.">
              <Textarea id="welcomeMessage" name="welcomeMessage" maxLength={1000} rows={3} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creazione…" : "Crea cliente"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
