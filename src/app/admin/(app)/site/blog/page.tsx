import type { Metadata } from "next";
import { SitePosts } from "@/components/admin/site/SitePosts";

export const metadata: Metadata = { title: "Blog del sito" };

export default function Page() {
  return <SitePosts />;
}
