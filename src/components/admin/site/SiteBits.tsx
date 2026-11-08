"use client";

import { Skeleton } from "@/components/ui/skeleton";

/** Errore del ponte: spiega cosa controllare (configurazione o firma). */
export function BridgeError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const config = /AW_CONVEX|configurat|firma/i.test(message);
  return (
    <div role="alert" className="rounded-2xl border border-dashed bg-card p-6 text-sm">
      <p className="font-medium">Non riesco a parlare con il sito Andromedia Web</p>
      <p className="mt-1 text-muted-foreground">{message}</p>
      {config ? (
        <p className="mt-3 text-muted-foreground">
          Su Convex (produzione) del portale imposta <code className="font-mono text-xs">AW_CONVEX_URL</code> (l&apos;indirizzo https://….convex.cloud del sito) e <code className="font-mono text-xs">AW_CONVEX_GUARD</code> (lo stesso segreto che il sito ha come
          <code className="ml-1 font-mono text-xs">AW_CONVEX_GUARD</code>). Dettagli in <code className="font-mono text-xs">docs/SITE.md</code>.
        </p>
      ) : null}
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-3 underline underline-offset-4">
          Riprova
        </button>
      ) : null}
    </div>
  );
}

export function SiteLoading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Caricamento">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}

export const slugify = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
