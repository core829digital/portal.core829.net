/**
 * Tipi e costanti delle annotazioni PDF. Modulo senza dipendenze: lo usano sia il server (che scrive nel PDF)
 * sia il browser (editor), senza portare nel browser la libreria pdf-lib.
 */

export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_PAGES = 300;
export const MAX_ANNOTATIONS = 500;
export const MAX_ANNOTATION_CHARS = 2000;
export const MIN_SIZE = 6;
export const MAX_SIZE = 48;
/** Distanza della linea di base dal bordo alto della casella di testo, in frazioni del corpo (Helvetica/Arial a interlinea 1,2). */
export const BASELINE = 0.9465;
export const LINE_HEIGHT = 1.2;

export type AnnotationColor = "black" | "graphite" | "red" | "blue";

export type PdfAnnotation = {
  /** Pagina, da 0. */
  page: number;
  /** Angolo in alto a sinistra della casella di testo, come frazione della pagina (0-1). */
  x: number;
  y: number;
  text: string;
  /** Corpo in punti (6-48). */
  size: number;
  color: AnnotationColor;
  bold: boolean;
};

