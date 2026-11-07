import type { Metadata } from "next";
import { AdminOverview } from "@/components/admin/AdminOverview";

export const metadata: Metadata = { title: "Panoramica" };

export default function AdminHome() {
  return <AdminOverview />;
}
