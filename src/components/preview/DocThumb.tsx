"use client";

import { FileText, FileSpreadsheet, FileType, Image as ImageIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useInView } from "@/lib/useInView";
import { openPdf, drawPage, type PdfDocLike } from "@/lib/pdfRender";
import { fileTypeLabel, previewKind } from "@/lib/previewKind";
import { cn } from "cn";
import dynamic from "next/dynamic";

const PreviewDialog = dynamic(() => import("@/components/preview/PreviewDialog").then((m) => m.PreviewDialog), { ssr: false });

/** Come si ottiene il file: un indirizzo (admin) oppure i byte (cliente, dopo il controllo del codice). Chiamato SOLO quando serve. */
export type PreviewResolve = () => Promise<string | Blob>;

const ICON = { pdf: FileText, other: FileType, image: ImageIcon } as const;

/**
 * Miniatura di un documento. Non scarica nulla finche' non e' visibile (caricamento pigro):
 * immagini = l'immagine stessa, PDF = prima pagina, altri file (Word, Excel...) = icona con il tipo.
 * Un clic apre l'anteprima grande. Se il file non si legge, resta l'icona (mai una pagina rotta).
 */
export function DocThumb({
  title,
  fileName,
  mimeType,
  resolve,
  className,
}: {
  title: string;
  fileName: string;
  mimeType: string;
  resolve: PreviewResolve;
  className?: string;
}) {
  const kind = previewKind(mimeType, fileName);
  const [boxRef, inView] = useInView<HTMLButtonElement>();
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cache = useRef<string | Blob | null>(null);
  const resolveRef = useRef(resolve);
  useEffect(() => {
    resolveRef.current = resolve; // l'ultima versione, senza far ripartire il caricamento a ogni disegno
  });
  const [open, setOpen] = useState(false);

  const getSource = useCallback(async () => {
    if (cache.current === null) cache.current = await resolveRef.current();
    return cache.current;
  }, []);

  useEffect(() => {
    if (!inView || kind === "other") return;
    let cancelled = false;
    let objectUrl: string | null = null;
    let doc: PdfDocLike | null = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- avvia il caricamento quando la miniatura diventa visibile
    setState("loading");
    (async () => {
      try {
        const source = await getSource();
        if (cancelled) return;
        if (kind === "image") {
          const src = typeof source === "string" ? source : (objectUrl = URL.createObjectURL(source));
          setImageSrc(src);
          setState("ready");
          return;
        }
        doc = await openPdf(typeof source === "string" ? { url: source } : { data: new Uint8Array(await source.arrayBuffer()) });
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        await drawPage(doc, 1, canvas, 160);
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      void doc?.destroy?.();
    };
  }, [inView, kind, getSource]);

  const Icon = kind === "other" && /xls|csv|ods/i.test(fileName) ? FileSpreadsheet : ICON[kind];
  const showFallback = kind === "other" || state === "error";
  const label = `Anteprima di ${title}`;

  return (
    <>
      <button
        ref={boxRef}
        type="button"
        onClick={() => setOpen(true)}
        disabled={showFallback}
        aria-label={showFallback ? `${title} (nessuna anteprima: ${fileTypeLabel(mimeType, fileName)})` : label}
        className={cn("group relative grid h-20 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 transition-shadow enabled:hover:ring-primary/50 enabled:hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2", className)}
      >
        {showFallback ? (
          <span className="flex flex-col items-center gap-1 text-muted-foreground">
            <Icon aria-hidden className="size-6" />
            <span className="font-mono text-[9px] uppercase tracking-wider">{fileTypeLabel(mimeType, fileName)}</span>
          </span>
        ) : (
          <>
            {state !== "ready" ? <span aria-hidden className="absolute inset-0 animate-pulse bg-foreground/5" /> : null}
            {kind === "image" && imageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- miniatura di un file privato (indirizzo temporaneo o blob)
              <img src={imageSrc} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" onError={() => setState("error")} />
            ) : null}
            {kind === "pdf" ? <canvas ref={canvasRef} aria-hidden className={cn("absolute left-1/2 top-0 h-auto max-w-none -translate-x-1/2", state === "ready" ? "opacity-100" : "opacity-0")} /> : null}
          </>
        )}
      </button>
      {open ? <PreviewDialog title={title} fileName={fileName} kind={kind} getSource={getSource} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
