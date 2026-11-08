import type { Metadata } from "next";
import { SiteMessages } from "@/components/admin/site/SiteMessages";

export const metadata: Metadata = { title: "Messaggi del sito" };

export default function Page() {
  return <SiteMessages />;
}
