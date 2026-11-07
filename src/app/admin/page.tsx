import type { Metadata } from "next";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ClientsList } from "@/components/admin/ClientsList";

export const metadata: Metadata = { title: "Clienti" };

export default function AdminHome() {
  return (
    <>
      <AdminHeader />
      <AdminGate>
        <ClientsList />
      </AdminGate>
    </>
  );
}
