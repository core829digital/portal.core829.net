import type { Metadata } from "next";
import { SubscriptionsOverview } from "@/components/admin/AdminLists";

export const metadata: Metadata = { title: "Abbonamenti" };

export default function Page() {
  return <SubscriptionsOverview />;
}
