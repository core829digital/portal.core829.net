import type { Metadata } from "next";
import { ProjectsOverview } from "@/components/admin/AdminLists";

export const metadata: Metadata = { title: "Progetti" };

export default function Page() {
  return <ProjectsOverview />;
}
