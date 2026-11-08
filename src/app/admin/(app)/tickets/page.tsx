import type { Metadata } from "next";
import { TicketsPage } from "@/components/admin/TicketsPage";

export const metadata: Metadata = { title: "Ticket" };

export default function Page() {
  return <TicketsPage />;
}
