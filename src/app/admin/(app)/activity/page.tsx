import type { Metadata } from "next";
import { ActivityOverview } from "@/components/admin/AdminLists";

export const metadata: Metadata = { title: "Attività" };

export default function Page() {
  return <ActivityOverview />;
}
