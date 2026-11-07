import { notFound } from "next/navigation";
import type { Id } from "@convex/_generated/dataModel";
import { canonicalAppUrl } from "@/lib/appUrl";
import { getClientEnv } from "@/lib/env";

// Forma di un ID Convex. Un valore diverso non puo' essere un cliente: 404 senza interrogare il server.
const CONVEX_ID = /^[a-z0-9]{16,64}$/;

/** Parametri comuni delle pagine di un cliente (solo lato server). */
export async function clientRouteParams(params: Promise<{ clientId: string }>): Promise<{ clientId: Id<"clients">; appUrl: string }> {
  const { clientId } = await params;
  if (!CONVEX_ID.test(clientId)) notFound();
  const { NEXT_PUBLIC_APP_URL } = getClientEnv();
  return { clientId: clientId as Id<"clients">, appUrl: canonicalAppUrl(NEXT_PUBLIC_APP_URL) };
}
