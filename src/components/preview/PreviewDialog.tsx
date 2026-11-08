"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "@/lib/useInView";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { drawPage, openPdf, type PdfDocLike } from "@/lib/pdfRender";
import type { PreviewKind } from "@/lib/previewKind";

const PAGE_WIDTH = 760;

/** Una pagina PDF: si disegna solo quando e' vicina allo schermo (un PDF di 100 pagine non le disegna tutte insieme). */
function LazyPage({ doc, n, pageHeight }: { doc: PdfDocLike; n: number; pageHeight: number }) {
  const [ref, seen] = useInView<HTMLDivElement>("600px");
  const canvas = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!seen || !canvas.current) return;
    let cancelled = false;
    void drawPage(doc, n, canvas.current, PAGE_WIDTH).then(() => !cancelled && setDone(true)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [seen, doc, n]);
  return (
    <div ref={ref} className="mx-auto max-w-full overflow-hidden rounded bg-white shadow ring-1 ring-foreground/10" style={{ width: PAGE_WIDTH, minHeight: done ? undefined : pageHeight }}>
      <canvas ref={canvas} role="img" aria-label={`Pagina ${n}`} className="block h-auto max-w-full" />
    </div>
  );
}

/** Anteprima grande: immagine intera oppure tutte le pagine del PDF (caricate man mano che si scorre). */
export function PreviewDialog({ title, fileName, kind, getSource, onClose }: { title: string; fileName: string; kind: PreviewKind; getSource: () => Promise<string | Blob>; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [doc, setDoc] = useState<PdfDocLike | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    let opened: PdfDocLike | null = null;
    (async () => {
      try {
        const source = await getSource();
        if (cancelled) return;
        if (kind === "image") setSrc(typeof source === "string" ? source : (objectUrl = URL.createObjectURL(source)));
        else if (kind === "pdf") {
          opened = await openPdf(typeof source === "string" ? { url: source } : { data: new Uint8Array(await source.arrayBuffer()) });
          if (!cancelled) setDoc(opened);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      void opened?.destroy?.();
    };
  }, [kind, getSource]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{fileName}</DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">Non riesco a mostrare l&apos;anteprima. Scarica il file per aprirlo.</p> : null}
        {!error && kind === "image" ? (
          src ? (
            // eslint-disable-next-line @next/next/no-img-element -- anteprima di un file privato
            <img src={src} alt={title} className="mx-auto max-h-[75vh] w-auto max-w-full rounded-lg object-contain" />
          ) : (
            <p className="text-sm text-muted-foreground" aria-busy="true">Caricamento…</p>
          )
        ) : null}
        {!error && kind === "pdf" ? (
          doc ? (
            <div className="space-y-4 bg-muted/50 p-2 sm:p-4">
              {Array.from({ length: Math.min(doc.numPages, 200) }, (_, i) => (
                <LazyPage key={i} doc={doc} n={i + 1} pageHeight={Math.round(PAGE_WIDTH * 1.414)} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" aria-busy="true">Caricamento…</p>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
