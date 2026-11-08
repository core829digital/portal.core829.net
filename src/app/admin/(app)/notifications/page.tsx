import type { Metadata } from "next";
import { NotificationsPage } from "@/components/admin/NotificationsPage";

export const metadata: Metadata = { title: "Centro notifiche" };

export default function Page() {
  return <NotificationsPage />;
}
