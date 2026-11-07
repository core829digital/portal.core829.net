"use client";

import { useState } from "react";
import { PdfEditorView } from "@/components/admin/docs/PdfEditor";
import { Toaster } from "@/components/ui/toaster";
import type { PdfAnnotation } from "@convex/lib/pdfAnnotations";

/** Editor PDF con dati INVENTATI per le prove nel browser. Raggiungibile solo con E2E_FIXTURES=1. */
export function PdfEditorFixture() {
  const [last, setLast] = useState<PdfAnnotation[] | null>(null);
  return (
    <>
      <Toaster />
      <PdfEditorView
        draft={{ name: "Preventivo del fornitore", status: "draft", sentAt: null, sentTo: null, client: { id: "cliente-prova", displayName: "Caffè Rosso Srl", email: "mario@caffe.it" } }}
        pdfUrl="/c/fixture/sample.pdf"
        pages={[
          { width: 595.28, height: 841.89 },
          { width: 595.28, height: 841.89 },
        ]}
        initial={[]}
        quickTexts={[
          { label: "Nome cliente", value: "Caffè Rosso Srl" },
          { label: "Data di oggi", value: "12/11/2026" },
        ]}
        onSave={async (annotations) => {
          setLast(annotations);
          return true;
        }}
        onOpen={async () => undefined}
        onSend={async () => undefined}
      />
      <pre data-testid="saved" className="sr-only">
        {last ? JSON.stringify(last) : ""}
      </pre>
    </>
  );
}
