import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DetailSkeleton } from "@/components/ui/page-skeletons";

const BrandPage = dynamic(() => import("@/components/admin/BrandPage").then((m) => m.BrandPage), { loading: () => <DetailSkeleton /> });

export const metadata: Metadata = { title: "Firma e timbro" };

export default function Page() {
  return <BrandPage />;
}
