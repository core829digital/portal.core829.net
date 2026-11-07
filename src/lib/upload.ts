/** Carica un file nell'archivio di Convex con un indirizzo di caricamento temporaneo e restituisce l'ID del file. */
export async function uploadToStorage(uploadUrl: string, file: File): Promise<string> {
  const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
  if (!response.ok) throw new Error("upload");
  const body: unknown = await response.json();
  const storageId = typeof body === "object" && body !== null && "storageId" in body ? (body as { storageId: unknown }).storageId : null;
  if (typeof storageId !== "string") throw new Error("upload");
  return storageId;
}

export const DOCX_EXTENSION = /\.docx$/i;
