/**
 * Elenco degli indirizzi autorizzati al login amministratore (variabile ADMIN_EMAILS).
 * Serve a NON spedire codici di accesso a indirizzi qualsiasi: senza questo limite il sistema
 * potrebbe essere usato per inviare email a chiunque dal nostro dominio.
 */

export function parseAdminEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0 && e.length <= 254);
}

export function isAllowedAdminEmail(email: unknown, raw: string | undefined): boolean {
  if (typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  if (normalized === "") return false;
  return parseAdminEmails(raw).includes(normalized);
}
