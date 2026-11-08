import type { Metadata } from "next";
import { SiteMessages } from "@/components/admin/site/SiteMessages";

export const metadata: Metadata = { title: "Richieste dal sito" };

export default function Page() {
  return <SiteMessages />;
}
