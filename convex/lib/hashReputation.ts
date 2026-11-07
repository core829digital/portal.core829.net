/**
 * Controllo facoltativo: l'impronta SHA-256 del file viene confrontata con il database di VirusTotal.
 * Si invia SOLO l'impronta (64 caratteri), MAI il file: i contratti dei clienti non lasciano il sistema.
 * Riconosce solo malware gia' noto: "sconosciuto" non vuol dire "sicuro".
 */
export type Reputation = "malicious" | "clean" | "unknown" | "error";

const SHA256_RE = /^[0-9a-f]{64}$/;

export async function checkHashReputation(apiKey: string, sha256: string): Promise<Reputation> {
  // Valida prima di costruire l'URL: nessun valore esterno entra nell'indirizzo.
  if (!SHA256_RE.test(sha256)) return "error";
  try {
    const response = await fetch(`https://www.virustotal.com/api/v3/files/${sha256}`, { headers: { "x-apikey": apiKey } });
    if (response.status === 404) return "unknown";
    if (!response.ok) return "error";
    const body: unknown = await response.json();
    const stats = (body as { data?: { attributes?: { last_analysis_stats?: { malicious?: unknown } } } }).data?.attributes?.last_analysis_stats;
    return typeof stats?.malicious === "number" && stats.malicious > 0 ? "malicious" : "clean";
  } catch {
    return "error";
  }
}
