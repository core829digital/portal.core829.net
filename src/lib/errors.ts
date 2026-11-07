import { ConvexError } from "convex/values";

/**
 * Messaggio da mostrare all'utente per un errore qualsiasi.
 * Si mostra solo il testo degli errori applicativi di Convex (scritti da noi, sicuri);
 * per tutto il resto un messaggio generico, senza dettagli tecnici.
 */
export function errorMessage(error: unknown, fallback = "Operazione non riuscita. Riprova."): string {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "string") return data;
    if (typeof data === "object" && data !== null && "message" in data) {
      const message = (data as { message: unknown }).message;
      if (typeof message === "string" && message.length > 0) return message;
    }
  }
  return fallback;
}

/** Codice dell'errore applicativo di Convex (es. "INVALID_LINK"), oppure null se non e' uno di quelli. */
export function errorCode(error: unknown): string | null {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "object" && data !== null && "code" in data) {
      const code = (data as { code: unknown }).code;
      if (typeof code === "string") return code;
    }
  }
  return null;
}
