import { ConvexError } from "convex/values";

/**
 * Errori applicativi con messaggi sicuri da mostrare all'utente.
 * Mai includere dettagli interni (ID, nomi di tabelle, stack) nel messaggio.
 */
export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_LINK"
  | "UNLOCK_REQUIRED"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "BAD_STATE";

export type AppErrorData = { code: AppErrorCode; message: string };

export function fail(code: AppErrorCode, message: string): never {
  throw new ConvexError<AppErrorData>({ code, message });
}

/**
 * Messaggio unico per ogni motivo di link non valido (inesistente, scaduto, revocato, malformato):
 * distinguerli aiuterebbe chi prova a indovinare i link.
 */
export const INVALID_LINK_MESSAGE = "Questo link non è valido o è scaduto. Contattaci per riceverne uno nuovo.";
