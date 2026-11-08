import type { Metadata } from "next";
import { SiteContent } from "@/components/admin/site/SiteContent";

export const metadata: Metadata = { title: "Contenuti del sito" };

export default function Page() {
  return <SiteContent />;
}
