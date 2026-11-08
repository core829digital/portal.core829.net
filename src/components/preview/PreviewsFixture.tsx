"use client";

import { useState } from "react";
import { DocThumb } from "@/components/preview/DocThumb";

/** Miniature con file INVENTATI per le prove nel browser (caricamento pigro, PDF, errori). Solo con E2E_FIXTURES=1. */
const PNG = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='120' height='90'><rect width='120' height='90' fill='#dd1a2b'/><circle cx='60' cy='45' r='25' fill='white'/></svg>");

export function PreviewsFixture() {
  const [calls, setCalls] = useState<Record<string, number>>({});
  const count = (key: string) => setCalls((c) => ({ ...c, [key]: (c[key] ?? 0) + 1 }));
  const track = <T,>(key: string, value: T | Promise<T>) => async () => {
    count(key);
    return value as T;
  };
  const rows = [
    { id: "img1", title: "Foto evento", fileName: "foto.png", mime: "image/png", resolve: track("img1", PNG) },
    { id: "pdf1", title: "Contratto", fileName: "contratto.pdf", mime: "application/pdf", resolve: track("pdf1", "/c/fixture/sample.pdf") },
    { id: "doc1", title: "Preventivo Word", fileName: "preventivo.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", resolve: track("doc1", "x") },
    { id: "xls1", title: "Listino", fileName: "listino.xlsx", mime: "application/vnd.ms-excel", resolve: track("xls1", "x") },
    { id: "bad1", title: "File rotto", fileName: "rotto.png", mime: "image/png", resolve: async () => {
      count("bad1");
      throw new Error("non disponibile");
    } },
    ...Array.from({ length: 14 }, (_, i) => ({ id: `fill${i}`, title: `Riempitivo ${i}`, fileName: "x.txt", mime: "text/plain", resolve: track(`fill${i}`, "x") })),
    { id: "late1", title: "Foto in fondo", fileName: "fondo.png", mime: "image/png", resolve: track("late1", PNG) },
    { id: "late2", title: "PDF in fondo", fileName: "fondo.pdf", mime: "application/pdf", resolve: track("late2", "/c/fixture/sample.pdf") },
  ];
  return (
    <div>
      <p data-testid="calls">{JSON.stringify(calls)}</p>
      <ul className="space-y-6">
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-center gap-3" style={{ marginBottom: i === 14 ? 900 : undefined }}>
            <DocThumb title={r.title} fileName={r.fileName} mimeType={r.mime} resolve={r.resolve} />
            <span>{r.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
