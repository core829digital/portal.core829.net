import type { Metadata } from "next";
import { InvoicesOverview } from "@/components/admin/AdminLists";

export const metadata: Metadata = { title: "Fatture" };

export default function Page() {
  return <InvoicesOverview />;
}
