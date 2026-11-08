import type { Metadata } from "next";
import { SignaturesPage } from "@/components/admin/SignaturesPage";

export const metadata: Metadata = { title: "Firme" };

export default function Page() {
  return <SignaturesPage />;
}
