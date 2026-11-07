"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useSyncExternalStore } from "react";
import { api } from "@convex/_generated/api";
import { ErrorBoundary } from "@/components/portal/ErrorBoundary";
import { PortalDocuments } from "@/components/portal/PortalDocuments";
import { PortalOverview } from "@/components/portal/PortalOverview";
import { Skeleton } from "@/components/ui/skeleton";
import { errorCode } from "@/lib/errors";
import { getServerSnapshot, getSnapshot, initToken, subscribe } from "@/lib/portalToken";

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold tracking-widest text-muted-foreground">CORE829</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{children}</p>
      </div>
    </main>
  );
}

function PortalContent({ token }: { token: string }) {
  const data = useQuery(api.portal.overview, { token });
  const touch = useMutation(api.portal.touch);

  // Registra l'apertura del link, una volta per visita. Un errore qui non deve disturbare il cliente.
  useEffect(() => {
    void touch({ token }).catch(() => undefined);
  }, [touch, token]);

  if (data === undefined) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10" aria-busy="true" aria-label="Caricamento">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-3xl items-baseline justify-between gap-3 px-4 py-4">
          <span className="text-xs font-semibold tracking-widest text-muted-foreground">CORE829</span>
          <span className="truncate text-sm font-medium">{data.client.displayName}</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-10 px-4 py-8">
        <PortalOverview data={data} />
        <PortalDocuments token={token} />
      </main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Per qualsiasi dubbio rispondi al messaggio con cui hai ricevuto questo link.
      </footer>
    </div>
  );
}

export function PortalApp() {
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    initToken();
  }, []);

  if (token === undefined) {
    return <div className="flex-1" aria-busy="true" />;
  }
  if (token === null) {
    return (
      <Message title="Apri il tuo link personale">
        Per vedere il tuo spazio apri il link che ti abbiamo inviato via email o WhatsApp. Se non lo trovi, scrivici e te ne invieremo uno
        nuovo.
      </Message>
    );
  }

  return (
    <ErrorBoundary
      fallback={(error) =>
        errorCode(error) === "INVALID_LINK" ? (
          <Message title="Link non valido o scaduto">
            Questo link non funziona più. Scrivici e ti invieremo subito un link nuovo: non serve altro.
          </Message>
        ) : (
          <Message title="Non riusciamo a caricare la pagina">Riprova tra qualche istante. Se il problema continua, scrivici.</Message>
        )
      }
    >
      <PortalContent token={token} />
    </ErrorBoundary>
  );
}
