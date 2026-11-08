"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import { Field } from "@/components/admin/Field";
import { PageHeader } from "@/components/dash/DashShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";

type Form = { enabled: boolean; text: string; href: string; cta: string };

function AnnouncementForm({ initial }: { initial: Form }) {
  const save = useMutation(api.site.announcementSave);
  const [f, setF] = useState<Form>(initial);
  const [pending, setPending] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      await save(f);
      toast.success(f.enabled ? "Avviso attivo: compare sul sito entro pochi minuti." : "Avviso salvato (spento).");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10 shadow-(--shadow-soft)">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Mostra l&apos;avviso in cima al sito
      </label>
      <Field id="ann-text" label="Testo" hint={`${f.text.length}/160 caratteri. Es. «Chiusi dal 24 al 26 dicembre».`}>
        <Input id="ann-text" maxLength={160} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ann-cta" label="Testo del pulsante (facoltativo)">
          <Input id="ann-cta" maxLength={40} value={f.cta} onChange={(e) => setF({ ...f, cta: e.target.value })} />
        </Field>
        <Field id="ann-href" label="Dove porta (facoltativo)" hint="Una pagina del sito (/it/contatti) oppure un indirizzo https://">
          <Input id="ann-href" maxLength={300} value={f.href} onChange={(e) => setF({ ...f, href: e.target.value })} />
        </Field>
      </div>
      <div aria-label="Anteprima dell'avviso" className="rounded-full bg-foreground px-4 py-2 text-center text-xs text-background">
        {f.text || "Il testo dell'avviso apparirà qui"}
        {f.cta ? <span className="ml-2 underline underline-offset-4">{f.cta}</span> : null}
      </div>
      <Button type="submit" disabled={pending || !dirty}>
        {pending ? "Salvo…" : dirty ? "Salva" : "Salvato"}
      </Button>
    </form>
  );
}

/** Avviso in testata di core829.net (chiusure, novità, offerte). */
export function SiteAnnouncement() {
  const data = useQuery(api.site.announcementGet, {});
  return (
    <>
      <PageHeader kicker="Sito core829.net" title="Avviso in testata" description="Una riga in cima a tutte le pagine del sito, in tutte le lingue. Il testo è uguale per tutti: scrivilo breve." />
      {data === undefined ? <Skeleton className="h-48 w-full rounded-2xl" /> : <AnnouncementForm initial={data} />}
    </>
  );
}
