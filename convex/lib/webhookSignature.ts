/**
 * Verifica della firma dei webhook secondo lo standard "Standard Webhooks" (quello usato da Resend/Svix).
 *
 * Intestazioni: `webhook-id`, `webhook-timestamp`, `webhook-signature` (o gli alias `svix-*`).
 * La firma e' HMAC-SHA256 del testo `id.timestamp.corpo` con il segreto (base64, dopo il prefisso `whsec_`),
 * in base64, nel formato `v1,<firma>` (ne possono comparire piu' d'una, separate da spazio).
 *
 * Protezioni:
 *  - si firma il corpo ESATTO ricevuto (mai una versione rielaborata);
 *  - il timestamp deve essere entro 5 minuti dall'ora attuale, in entrambe le direzioni (anti replay);
 *  - il confronto delle firme e' a tempo costante (`crypto.subtle.verify`);
 *  - ogni difetto produce lo stesso risultato: chi risponde non rivela cosa e' mancato.
 */

const TOLERANCE_SECONDS = 5 * 60;
const MAX_SIGNATURES = 10;
const ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
const PREFIX = "whsec_";

type HeaderReader = { get(name: string): string | null };
export type WebhookVerification = { ok: true; id: string } | { ok: false };

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function verifyWebhook(input: {
  secret: string;
  headers: HeaderReader;
  body: string;
  nowMs: number;
}): Promise<WebhookVerification> {
  const { secret, headers, body, nowMs } = input;
  const fail: WebhookVerification = { ok: false };

  const id = headers.get("webhook-id") ?? headers.get("svix-id");
  const timestampHeader = headers.get("webhook-timestamp") ?? headers.get("svix-timestamp");
  const signatureHeader = headers.get("webhook-signature") ?? headers.get("svix-signature");
  if (!id || !timestampHeader || !signatureHeader) return fail;
  if (!ID_RE.test(id) || !/^\d{1,12}$/.test(timestampHeader)) return fail;

  const timestamp = parseInt(timestampHeader, 10);
  const now = Math.floor(nowMs / 1000);
  if (Math.abs(now - timestamp) > TOLERANCE_SECONDS) return fail;

  const keyBytes = base64ToBytes(secret.startsWith(PREFIX) ? secret.slice(PREFIX.length) : secret);
  if (!keyBytes || keyBytes.length === 0) return fail;

  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${body}`);

  for (const candidate of signatureHeader.split(" ").slice(0, MAX_SIGNATURES)) {
    const [version, signature] = candidate.split(",");
    if (version !== "v1" || !signature) continue;
    const signatureBytes = base64ToBytes(signature);
    if (!signatureBytes) continue;
    if (await crypto.subtle.verify("HMAC", cryptoKey, signatureBytes as BufferSource, signed)) return { ok: true, id };
  }
  return fail;
}
