"use client";

import { useState, type FormEvent } from "react";
import { CONSENT_TEXTS, CONSENT_VERSION } from "@convex/lib/consent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type SignOutcome = { ok: true } | { ok: false; error: string; staleCode?: boolean };

/**
 * Finestra di firma: il cliente legge il documento, scrive nome e cognome, accetta le due dichiarazioni e firma.
 * La firma e' elettronica semplice: identifica il cliente il link personale piu' il codice ricevuto via email.
 */
export function SignDialog({
  title,
  onOpenDocument,
  onSign,
  onClose,
}: {
  title: string;
  /** Apre/scarica il PDF da leggere prima di firmare. */
  onOpenDocument: () => Promise<void>;
  onSign: (input: { fullName: string; consent: true; consentVersion: string }) => Promise<SignOutcome>;
  onClose: () => void;
}) {
  const [read, setRead] = useState(false);
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; staleCode?: boolean } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fullName = String(new FormData(e.currentTarget).get("fullName") ?? "").trim();
    if (!(c1 && c2)) return void setMessage({ text: "Per firmare devi accettare entrambe le dichiarazioni." });
    setPending(true);
    setMessage(null);
    const result = await onSign({ fullName, consent: true, consentVersion: CONSENT_VERSION });
    setPending(false);
    if (!result.ok) setMessage({ text: result.error, staleCode: result.staleCode });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Firma «{title}»</DialogTitle>
          <DialogDescription>Leggi il documento, poi conferma con il tuo nome. La firma è elettronica: la data, l&apos;ora e il tuo indirizzo IP vengono registrati come prova.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void onOpenDocument().then(() => setRead(true));
            }}
          >
            Leggi il documento (PDF)
          </Button>
          <div className="grid gap-1.5">
            <Label htmlFor="fullName">Nome e cognome</Label>
            <Input id="fullName" name="fullName" autoComplete="name" maxLength={80} required placeholder="Come da documento d'identità" disabled={pending} />
          </div>
          <fieldset className="grid gap-3 text-sm">
            <legend className="sr-only">Dichiarazioni</legend>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" className="mt-0.5 size-4" checked={c1} onChange={(e) => setC1(e.target.checked)} disabled={pending} />
              <span>{CONSENT_TEXTS[0]}</span>
            </label>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" className="mt-0.5 size-4" checked={c2} onChange={(e) => setC2(e.target.checked)} disabled={pending} />
              <span>{CONSENT_TEXTS[1]}</span>
            </label>
          </fieldset>
          {!read ? <p className="text-xs text-muted-foreground">Prima di firmare apri e leggi il documento con il pulsante qui sopra.</p> : null}
          {message ? (
            <div role="alert" className="rounded-xl bg-brand-tint p-3 text-sm">
              <p>{message.text}</p>
              {message.staleCode ? (
                <button type="button" className="mt-2 underline underline-offset-4" onClick={() => window.location.reload()}>
                  Ricarica la pagina e richiedi un nuovo codice
                </button>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Annulla
            </Button>
            <Button type="submit" disabled={pending || !read}>
              {pending ? "Firmo…" : "Firma il documento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
