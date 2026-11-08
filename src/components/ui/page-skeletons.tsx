import { Skeleton } from "@/components/ui/skeleton";

/**
 * Scheletri di pagina: stessa struttura delle pagine vere (titolo, indicatori, pannelli, righe),
 * cosi' al caricamento nulla si sposta e l'occhio non perde il punto. Usati dai `loading.tsx` e dai caricamenti dei dati.
 */

function Header() {
  return (
    <div className="mb-6 space-y-2" aria-hidden>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-72 max-w-full" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}

const frame = (children: React.ReactNode, label: string) => (
  <div className="fade-in" role="status" aria-busy="true" aria-live="polite">
    <span className="sr-only">{label}</span>
    {children}
  </div>
);

/** Panoramica: indicatori + grafico + due pannelli. */
export function DashboardSkeleton({ kpis = 4 }: { kpis?: number }) {
  return frame(
    <>
      <Header />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(12.5rem,1fr))] sm:gap-4" aria-hidden>
        {Array.from({ length: kpis }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3" aria-hidden>
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </>,
    "Caricamento della pagina",
  );
}

/** Elenchi e tabelle. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return frame(
    <>
      <Header />
      <div className="mb-4 flex gap-2" aria-hidden>
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
      <div className="divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10" aria-hidden>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </>,
    "Caricamento dell'elenco",
  );
}

/** Scheda / modulo. */
export function DetailSkeleton() {
  return frame(
    <>
      <Header />
      <div className="space-y-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:p-6" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
        ))}
      </div>
    </>,
    "Caricamento della scheda",
  );
}

/** Editor (documenti, PDF): barra strumenti + pagina. */
export function EditorSkeleton() {
  return frame(
    <>
      <Header />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]" aria-hidden>
        <Skeleton className="h-[34rem] rounded-2xl" />
        <div className="space-y-3">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </>,
    "Caricamento dell'editor",
  );
}
