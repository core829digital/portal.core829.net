"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { createContext, useContext, useState, type ReactNode } from "react";

const SiteUrlContext = createContext<string | null>(null);

/** Indirizzo HTTP del deployment (per i download), oppure null se non ricavabile. */
export function useConvexSiteUrl(): string | null {
  return useContext(SiteUrlContext);
}

/** Client Convex SENZA autenticazione: l'unica chiave del cliente e' il token del suo link. */
export function PortalProvider({ url, siteUrl, children }: { url: string; siteUrl: string | null; children: ReactNode }) {
  const [client] = useState(() => new ConvexReactClient(url));
  return (
    <ConvexProvider client={client}>
      <SiteUrlContext.Provider value={siteUrl}>{children}</SiteUrlContext.Provider>
    </ConvexProvider>
  );
}
