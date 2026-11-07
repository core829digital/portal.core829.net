"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { api } from "@convex/_generated/api";
import { ErrorBoundary } from "@/components/portal/ErrorBoundary";
import { PortalChrome } from "@/components/portal/PortalChrome";
import { Skeleton } from "@/components/ui/skeleton";
import { errorCode } from "@/lib/errors";
import { getServerSnapshot, getSnapshot, initToken, subscribe } from "@/lib/portalToken";

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand-deep">CORE829</p>
        <h1 className="mt-3 font-display text-2xl tracking-tight">{title}</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{children}</p>
      </div>
    </main>
  );
}

function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10" aria-busy="true" aria-label="Caricamento">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-2xl" />
    </div>
  );
}

function PortalContent({ token, children }: { token: string; children: ReactNode }) {
  const data = useQuery(api.portal.overview, { token });
  const touch = useMutation(api.portal.touch);

  // Registra l'apertura del link, una volta per visita. Un errore qui non deve disturbare il cliente.
  useEffect(() => {
    void touch({ token }).catch(() => undefined);
  }, [touch, token]);

  if (data === undefined) return <Loading />;
  return (
    <PortalChrome data={data} token={token} base="/c">
      {children}
    </PortalChrome>
  );
}

/** Legge il link personale, carica i dati del cliente e li passa alle pagine del portale. */
export function PortalFrame({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    initToken();
  }, []);

  if (token === undefined) return <div className="min-h-dvh flex-1" aria-busy="true" />;
  if (token === null) {
    return (
      <Message title="Apri il tuo link personale">
        Per vedere il tuo spazio apri il link che ti abbiamo inviato via email o WhatsApp. Se non lo trovi, scrivici e te ne invieremo uno nuovo.
      </Message>
    );
  }

  return (
    <ErrorBoundary
      fallback={(error) =>
        errorCode(error) === "INVALID_LINK" ? (
          <Message title="Link non valido o scaduto">Questo link non funziona più. Scrivici e ti invieremo subito un link nuovo: non serve altro.</Message>
        ) : (
          <Message title="Non riusciamo a caricare la pagina">Riprova tra qualche istante. Se il problema continua, scrivici.</Message>
        )
      }
    >
      <PortalContent token={token}>{children}</PortalContent>
    </ErrorBoundary>
  );
}
