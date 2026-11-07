"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useState, type ReactNode } from "react";

/** Client Convex SENZA autenticazione: l'unica chiave del cliente e' il token del suo link. */
export function PortalProvider({ url, children }: { url: string; children: ReactNode }) {
  const [client] = useState(() => new ConvexReactClient(url));
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
