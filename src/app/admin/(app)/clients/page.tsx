import type { Metadata } from "next";
import { ClientsList } from "@/components/admin/ClientsList";

export const metadata: Metadata = { title: "Clienti" };

export default function ClientsPage() {
  return <ClientsList />;
}
