"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { PageHeader } from "@/components/dash/DashShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { uploadToStorage } from "@/lib/upload";

type Kind = "stamp" | "signature";
const LABEL: Record<Kind, { title: string; hint: string }> = {
  stamp: { title: "Timbro CORE829 SRL", hint: "PNG con sfondo trasparente, quadrato o rotondo." },
  signature: { title: "Firma del legale rappresentante", hint: "PNG con sfondo trasparente, orizzontale." },
};

/** Firma e timbro di CORE829: archivio privato, usati automaticamente su ogni documento in uscita. */
export function BrandPage() {
  const status = useQuery(api.brand.status, {});
  const uploadUrl = useMutation(api.brand.uploadUrl);
  const register = useAction(api.brandActions.register);
  const remove = useMutation(api.brand.remove);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [toRemove, setToRemove] = useState<Kind | null>(null);

  async function onFile(kind: Kind, file: File | undefined) {
    if (!file) return;
    if (!/\.png$/i.test(file.name) && file.type !== "image/png") return void toast.error("Serve un file PNG (meglio con sfondo trasparente).");
    if (file.size > 2 * 1024 * 1024) return void toast.error("Il file supera i 2 MB.");
    setBusy(kind);
    try {
      const storageId = (await uploadToStorage(await uploadUrl({}), file)) as Id<"_storage">;
      await register({ kind, storageId });
      toast.success(`${LABEL[kind].title}: salvato nell'archivio privato.`);
    } catch (error) {
      toast.error(errorMessage(error, "Caricamento non riuscito."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        kicker="Documenti"
        title="Firma e timbro"
        description="Vengono aggiunti automaticamente a ogni documento che esce dal portale (PDF, Word, PDF caricati, report), insieme ai due loghi CORE829."
      />
      <p className="rounded-2xl bg-brand-tint p-4 text-sm ring-1 ring-primary/20">
        <strong>Sicurezza:</strong> i file restano nell&apos;archivio privato di Convex, non nel codice (il repository GitHub è pubblico). Li vede solo l&apos;amministratore e li legge solo il server per comporre i documenti. Ogni cambio è nel registro attività.
      </p>
      {status === undefined ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(["stamp", "signature"] as const).map((kind) => {
            const a = status[kind];
            return (
              <section key={kind} aria-label={LABEL[kind].title} className="flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-foreground/10 shadow-(--shadow-soft)">
                <h2 className="font-display text-base tracking-tight">{LABEL[kind].title}</h2>
                <div className="grid h-44 place-items-center rounded-xl bg-white ring-1 ring-foreground/10">
                  {a?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- anteprima di un file privato servito da Convex
                    <img src={a.url} alt={`Anteprima: ${LABEL[kind].title}`} className="max-h-40 max-w-[90%] object-contain" loading="lazy" decoding="async" />
                  ) : (
                    <p className="px-4 text-center text-sm text-muted-foreground">Non ancora caricato: i documenti usciranno senza.</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {LABEL[kind].hint} Massimo 2 MB.{a ? ` Caricato il ${formatDateTime(a.updatedAt)} (${a.width}×${a.height}).` : ""}
                </p>
                <div className="mt-auto flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-foreground/15 hover:bg-muted">
                    <Upload aria-hidden className="size-4" /> {busy === kind ? "Carico…" : a ? "Sostituisci" : "Carica il PNG"}
                    <input type="file" accept="image/png" className="sr-only" disabled={busy !== null} onChange={(e) => { void onFile(kind, e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                  {a ? (
                    <Button variant="ghost" onClick={() => setToRemove(kind)}>
                      <Trash2 aria-hidden /> Elimina
                    </Button>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={toRemove !== null}
        title="Eliminare il file?"
        description="I documenti inviati da ora in poi usciranno senza. Quelli già inviati non cambiano."
        confirmLabel="Elimina"
        destructive
        onCancel={() => setToRemove(null)}
        onConfirm={() => {
          const kind = toRemove;
          setToRemove(null);
          if (kind) void remove({ kind }).then(() => toast.success("Eliminato.")).catch((e: unknown) => toast.error(errorMessage(e)));
        }}
      />
    </>
  );
}
