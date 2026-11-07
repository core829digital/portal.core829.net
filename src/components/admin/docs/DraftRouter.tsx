"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { DraftEditor } from "@/components/admin/docs/DraftEditor";
import { PdfEditor } from "@/components/admin/docs/PdfEditor";
import { Skeleton } from "@/components/ui/skeleton";

/** Apre l'editor giusto: Word (campi e testo) oppure PDF (testi sopra la pagina). */
export function DraftRouter({ draftId }: { draftId: Id<"docDrafts"> }) {
  const draft = useQuery(api.docStudio.getDraft, { draftId });
  if (draft === undefined) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Caricamento">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }
  if (draft === null) return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Documento non trovato.</p>;
  return draft.format === "pdf" ? <PdfEditor draftId={draftId} /> : <DraftEditor draftId={draftId} />;
}
