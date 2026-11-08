import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { ListSkeleton } from "@/components/ui/page-skeletons";

const TemplatesPage = dynamic(() => import("@/components/admin/docs/TemplatesPage").then((m) => m.TemplatesPage), { loading: () => <ListSkeleton /> });

export const metadata: Metadata = { title: "Modelli" };

export default function Page() {
  return <TemplatesPage />;
}
