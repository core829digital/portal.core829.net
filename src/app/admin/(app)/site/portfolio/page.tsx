import type { Metadata } from "next";
import { SiteWorks } from "@/components/admin/site/SiteWorks";

export const metadata: Metadata = { title: "Portfolio del sito" };

export default function Page() {
  return <SiteWorks />;
}
