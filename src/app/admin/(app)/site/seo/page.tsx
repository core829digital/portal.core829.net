import type { Metadata } from "next";
import { SiteSeo } from "@/components/admin/site/SiteSeo";

export const metadata: Metadata = { title: "SEO del sito" };

export default function Page() {
  return <SiteSeo />;
}
