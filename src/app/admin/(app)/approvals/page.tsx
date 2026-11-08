import type { Metadata } from "next";
import { ApprovalsPage } from "@/components/admin/ApprovalsPage";

export const metadata: Metadata = { title: "Approvazioni" };

export default function Page() {
  return <ApprovalsPage />;
}
