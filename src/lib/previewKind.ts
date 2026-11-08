/** Che anteprima si puo' mostrare per un file, dal tipo dichiarato. Funzione pura. */
export type PreviewKind = "image" | "pdf" | "other";

export function previewKind(mimeType: string, fileName = ""): PreviewKind {
  const mime = mimeType.toLowerCase();
  if (/^image\/(png|jpe?g|webp|gif|avif)$/.test(mime)) return "image";
  if (mime === "application/pdf") return "pdf";
  // Il tipo dichiarato puo' mancare o essere generico: si guarda anche l'estensione.
  if (mime === "" || mime === "application/octet-stream") {
    if (/\.(png|jpe?g|webp|gif|avif)$/i.test(fileName)) return "image";
    if (/\.pdf$/i.test(fileName)) return "pdf";
  }
  return "other";
}

/** Etichetta breve per i file senza anteprima (DOCX, XLSX...). */
export function fileTypeLabel(mimeType: string, fileName: string): string {
  const ext = /\.([A-Za-z0-9]{1,5})$/.exec(fileName)?.[1]?.toUpperCase();
  if (ext) return ext;
  return mimeType.split("/")[1]?.slice(0, 5).toUpperCase() || "FILE";
}
