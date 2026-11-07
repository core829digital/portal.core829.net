"use client";

import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { DraftEditorView, type DraftMeta } from "@/components/admin/docs/DraftEditor";
import { detectFields } from "@convex/lib/docFields";
import type { DocParagraph } from "@convex/lib/docx";

/**
 * Editor con dati INVENTATI per le prove nel browser (accessibilita', uso da tastiera, telefono).
 * Raggiungibile solo con E2E_FIXTURES=1 (vedi src/app/c/fixture/layout.tsx).
 */
const texts: [string, string | null, boolean, string | null][] = [
  ["CORE829 SRL MASTER SERVICES AGREEMENT", "Title", false, null],
  ["Contratto n.", null, true, null],
  ["{{contract.number}}", null, true, "Contratto n."],
  ["Cliente", null, true, null],
  ["{{client.name}}", null, true, "Cliente"],
  ["ARTICOLO 1 DEFINIZIONI", "Heading1", false, null],
  ["1.1 Ai fini del Contratto, i termini seguenti hanno il significato indicato. “CORE829” indica CORE829 SRL.", null, false, null],
  ["Data di efficacia: [GG/MM/AAAA]", null, false, null],
  ["Corrispettivo una tantum: € ____________", null, false, null],
  ["☐ Sviluppo software   ☐ Marketing   ☐ Servizi per eventi", null, false, null],
  ["Firma del Cliente: _____________________________", null, false, null],
];
const paragraphs: DocParagraph[] = [
  ...texts.map(([text, style, inTable, rowLabel], index) => ({ index, text, style, inTable, rowLabel })),
  ...Array.from({ length: 70 }, (_, i) => ({ index: texts.length + i, text: `Clausola ${i + 2}.1 Testo di esempio della clausola numero ${i + 2}, con più frasi per vedere come si comporta l'editor su paragrafi lunghi e su schermi stretti.`, style: null, inTable: false, rowLabel: null })),
];

const draft: DraftMeta = {
  name: "Master Services Agreement — Caffè Rosso Srl",
  status: "draft",
  sentAt: null,
  sentTo: null,
  client: { id: "cliente-prova", displayName: "Caffè Rosso Srl", email: "mario@caffe.it" },
};

export function EditorFixture() {
  const [version, setVersion] = useState(0);
  const content = { paragraphs, fields: detectFields(paragraphs) };
  return (
    <>
    <Toaster />
    <DraftEditorView
      key={version}
      draft={draft}
      content={content}
      onSave={async () => {
        setVersion((v) => v + 1);
        return true;
      }}
      onOpen={async () => undefined}
      onSend={async () => undefined}
    />
    </>
  );
}
