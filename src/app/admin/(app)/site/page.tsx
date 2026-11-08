import type { Metadata } from "next";
import { SiteOverview } from "@/components/admin/site/SiteOverview";

export const metadata: Metadata = { title: "Sito Andromedia" };

export default function Page() {
  return <SiteOverview />;
}
