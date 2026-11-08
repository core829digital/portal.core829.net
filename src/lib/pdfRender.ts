/**
 * pdf.js caricato solo quando serve (e' una libreria grande): serve alle miniature e alle anteprime dei PDF.
 * Mai eseguiti script del PDF: pdf.js li lascia disattivati di serie.
 */
export type PdfPageLike = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvas: HTMLCanvasElement; viewport: unknown }) => { cancel: () => void; promise: Promise<unknown> };
};
export type PdfDocLike = { numPages: number; getPage: (n: number) => Promise<PdfPageLike>; destroy?: () => Promise<void> };

export async function openPdf(source: { url: string } | { data: Uint8Array }): Promise<PdfDocLike> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const loading = pdfjs.getDocument("url" in source ? { url: source.url } : { data: source.data });
  return (await loading.promise) as unknown as PdfDocLike;
}

/** Disegna una pagina su un canvas alla larghezza richiesta (in pixel CSS), nitida su schermi ad alta densita'. */
export async function drawPage(doc: PdfDocLike, pageNumber: number, canvas: HTMLCanvasElement, cssWidth: number): Promise<void> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
  await page.render({ canvas, viewport }).promise;
}
