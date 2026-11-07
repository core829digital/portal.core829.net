import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Id } from "@convex/_generated/dataModel";
import { DraftRouter } from "@/components/admin/docs/DraftRouter";

export const metadata: Metadata = { title: "Documento" };

// Forma di un ID Convex: un valore diverso non puo' essere una bozza (404 senza interrogare il server).
const CONVEX_ID = /^[a-z0-9]{16,64}$/;

export default async function Page({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  if (!CONVEX_ID.test(draftId)) notFound();
  return <DraftRouter draftId={draftId as Id<"docDrafts">} />;
}
