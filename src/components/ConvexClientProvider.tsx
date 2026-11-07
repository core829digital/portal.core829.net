"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { useState, type ReactNode } from "react";

export function ConvexClientProvider({ url, children }: { url: string; children: ReactNode }) {
  // Un solo client per tutta la vita del componente.
  const [client] = useState(() => new ConvexReactClient(url));
  return <ConvexAuthNextjsProvider client={client}>{children}</ConvexAuthNextjsProvider>;
}
