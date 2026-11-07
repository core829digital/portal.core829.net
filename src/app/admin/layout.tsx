import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { Toaster } from "@/components/ui/toaster";
import { UiProvider } from "@/components/UiProvider";
import { getClientEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Amministrazione",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Se la configurazione manca o non e' valida si ferma qui, con la pagina di errore generica.
  const { NEXT_PUBLIC_CONVEX_URL } = getClientEnv();
  // Il nonce della richiesta, generato in proxy.ts, serve ai componenti che inseriscono stili.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <ConvexAuthNextjsServerProvider>
      <ConvexClientProvider url={NEXT_PUBLIC_CONVEX_URL}>
        <UiProvider nonce={nonce}>
          {children}
          <Toaster />
        </UiProvider>
      </ConvexClientProvider>
    </ConvexAuthNextjsServerProvider>
  );
}
