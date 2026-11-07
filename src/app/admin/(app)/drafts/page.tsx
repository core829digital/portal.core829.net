import type { Metadata } from "next";
import { DraftsList } from "@/components/admin/docs/DraftsList";

export const metadata: Metadata = { title: "Bozze e invii" };

export default function Page() {
  return <DraftsList />;
}
