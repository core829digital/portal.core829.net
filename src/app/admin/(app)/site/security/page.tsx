import type { Metadata } from "next";
import { SiteSecurity } from "@/components/admin/site/SiteSecurity";

export const metadata: Metadata = { title: "Sicurezza del sito" };

export default function Page() {
  return <SiteSecurity />;
}
