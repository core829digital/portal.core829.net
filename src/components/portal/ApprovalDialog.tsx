"use client";

import { useState, type FormEvent } from "react";
import { Field } from "@/components/admin/Field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ApprovalDecision = "approve" | "changes";

/**
 * Finestra di approvazione: il cliente approva (nome + nota facoltativa) oppure chiede modifiche (descrizione obbligatoria).
 * Non e' una firma: serve a dirci «va bene» o «cambiate questo».
 */
export function ApprovalDialog({ title, mode, message, onDecide, onClose }: { title: string; mode: ApprovalDecision; message?: string | null; onDecide: (v: { fullName: string; comment: string }) => Promise<string | null>; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approve = mode === "approve";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const result = await onDecide({ fullName: String(f.get("fullName") ?? "").trim(), comment: String(f.get("comment") ?? "").trim() });
    setPending(false);
    if (result) setError(result);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{approve ? `Approva «${title}»` : `Richiedi modifiche a «${title}»`}</DialogTitle>
          <DialogDescription>
            {approve ? "Confermi che il documento va bene così. La tua risposta è definitiva: se cambi idea, ce lo scrivi e ne prepariamo uno nuovo." : "Dicci cosa cambiare: prepariamo una nuova versione e te la inviamo da approvare."}
          </DialogDescription>
        </DialogHeader>
        {message ? <p className="rounded-xl bg-muted/60 p-3 text-sm">{message}</p> : null}
        <form onSubmit={(e) => void submit(e)} className="grid gap-4" noValidate>
          <Field id="approval-name" label="Nome e cognome" hint="Serve a sapere chi ha risposto.">
            <Input id="approval-name" name="fullName" autoComplete="name" required minLength={3} maxLength={120} autoFocus />
          </Field>
          <Field id="approval-comment" label={approve ? "Nota (facoltativa)" : "Cosa vuoi cambiare"}>
            <Textarea id="approval-comment" name="comment" rows={4} maxLength={2000} required={!approve} />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Annulla
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Invio…" : approve ? "Approva" : "Invia la richiesta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
