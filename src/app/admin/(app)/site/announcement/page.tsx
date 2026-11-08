import type { Metadata } from "next";
import { SiteAnnouncement } from "@/components/admin/site/SiteAnnouncement";

export const metadata: Metadata = { title: "Avviso del sito" };

export default function Page() {
  return <SiteAnnouncement />;
}
