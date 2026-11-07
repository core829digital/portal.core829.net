import type { Metadata } from "next";
import { BrandPage } from "@/components/admin/BrandPage";

export const metadata: Metadata = { title: "Firma e timbro" };

export default function Page() {
  return <BrandPage />;
}
