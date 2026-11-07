import type { Metadata } from "next";
import { TemplatesPage } from "@/components/admin/docs/TemplatesPage";

export const metadata: Metadata = { title: "Modelli" };

export default function Page() {
  return <TemplatesPage />;
}
