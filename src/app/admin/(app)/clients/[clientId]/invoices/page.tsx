import type { Metadata } from "next";
import { clientRouteParams } from "@/components/admin/clientRoute";
import { ClientSectionPage } from "@/components/admin/ClientSectionPage";

export const metadata: Metadata = { title: "Cliente" };

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId, appUrl } = await clientRouteParams(params);
  return <ClientSectionPage clientId={clientId} section="invoices" appUrl={appUrl} />;
}
