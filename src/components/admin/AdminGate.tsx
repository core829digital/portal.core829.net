"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mostra il contenuto solo a un amministratore. E' una comodita' dell'interfaccia: la sicurezza
 * vera sta nel server (`requireAdmin` in ogni funzione Convex), che rifiuta chiunque altro
 * anche se questo controllo venisse aggirato.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.admins.me, isAuthenticated ? {} : "skip");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/admin/login");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated || me === undefined) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10" aria-busy="true" aria-label="Caricamento">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!me.isAdmin) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Accesso non autorizzato</h1>
        <p className="text-sm text-muted-foreground">
          Questo account non è abilitato come amministratore del portale.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            void signOut().then(() => router.replace("/admin/login"));
          }}
        >
          Esci
        </Button>
      </main>
    );
  }

  return <>{children}</>;
}
