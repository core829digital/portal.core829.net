"use client";

import { Button } from "@/components/ui/button";

// Messaggio volutamente generico: nessun dettaglio tecnico, stack o testo dell'errore
// deve arrivare al cliente (prevenzione della fuga di informazioni, OWASP A05/A09).
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <h1 className="text-2xl tracking-tight">Qualcosa è andato storto</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          Non siamo riusciti a caricare la pagina. Riprova tra un momento: se il problema
          continua, contattaci.
        </p>
        <Button className="mt-6" onClick={() => reset()}>
          Riprova
        </Button>
      </div>
    </main>
  );
}
