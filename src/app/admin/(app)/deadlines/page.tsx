import type { Metadata } from "next";
import { DeadlinesPage } from "@/components/admin/DeadlinesPage";

export const metadata: Metadata = { title: "Scadenziario" };

export default function Page() {
  return <DeadlinesPage />;
}
