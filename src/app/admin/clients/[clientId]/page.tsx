import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Id } from "@convex/_generated/dataModel";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ClientDetail } from "@/components/admin/ClientDetail";
import { getClientEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Cliente" };

// Forma di un ID Convex. Un valore diverso non puo' essere un cliente: 404 senza interrogare il server.
const CONVEX_ID = /^[a-z0-9]{16,64}$/;

export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!CONVEX_ID.test(clientId)) notFound();
  const { NEXT_PUBLIC_APP_URL } = getClientEnv();
  return (
    <>
      <AdminHeader />
      <AdminGate>
        <ClientDetail clientId={clientId as Id<"clients">} appUrl={NEXT_PUBLIC_APP_URL} />
      </AdminGate>
    </>
  );
}
