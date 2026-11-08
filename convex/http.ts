import { httpRouter } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { env, httpAction } from "./_generated/server";
import { corsHeaders } from "./lib/cors";
import { contentDisposition } from "./lib/files";
import { isIpAllowed } from "./lib/ipAllowlist";
import { verifyWebhook } from "./lib/webhookSignature";
import { HANDLED_EVENT_TYPES } from "./webhooks";

const http = httpRouter();

// Rotte di Convex Auth (metadati OIDC e JWKS usati per verificare i token).
auth.addHttpRoutes(http);

const MAX_BODY_CHARS = 4096;

http.route({
  path: "/portal/download",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(request.headers.get("Origin"), env.SITE_URL),
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
      },
    });
  }),
});

/**
 * Download di un documento da parte del cliente.
 *
 * - Metodo POST con il segreto nel corpo (mai nell'URL, quindi mai nei log).
 * - Ogni richiesta e' autorizzata da capo: link valido + sessione di sblocco + documento del cliente,
 *   visibile e gia' controllato (`prepareDownload`).
 * - UN SOLO errore (404) per qualunque motivo di rifiuto: non si capisce quale controllo e' fallito.
 * - Il file e' sempre "da scaricare" (`attachment`), non si apre mai nel sito: `nosniff` impedisce al
 *   browser di indovinare un tipo diverso e `sandbox` lo isola se venisse aperto comunque.
 */
http.route({
  path: "/portal/download",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const cors = corsHeaders(request.headers.get("Origin"), env.SITE_URL);
    const notFound = () =>
      new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors },
      });

    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return notFound();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return notFound();
    }
    if (typeof body !== "object" || body === null) return notFound();
    const { token, unlockToken, documentId } = body as Record<string, unknown>;
    if (typeof token !== "string" || typeof unlockToken !== "string" || typeof documentId !== "string") return notFound();

    let prepared: { storageId: Id<"_storage">; fileName: string; mimeType: string };
    try {
      prepared = await ctx.runMutation(internal.portal.prepareDownload, {
        token,
        unlockToken,
        documentId: documentId as Id<"documents">,
      });
    } catch {
      return notFound();
    }

    const blob = await ctx.storage.get(prepared.storageId);
    if (!blob) return notFound();

    return new Response(blob, {
      status: 200,
      headers: {
        "Content-Type": prepared.mimeType,
        "Content-Disposition": contentDisposition(prepared.fileName),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
        ...cors,
      },
    });
  }),
});

http.route({
  path: "/portal/sign",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders(request.headers.get("Origin"), env.SITE_URL), "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" },
    });
  }),
});

/**
 * Firma elettronica del cliente. Passa da qui (e non da una funzione Convex normale) per registrare come prova
 * l'indirizzo IP e il browser della sottoscrizione. Ogni richiesta e' autorizzata da capo (link + codice recente + richiesta del cliente).
 * Gli errori attesi (nome, consenso, scadenza...) tornano con un messaggio leggibile; gli altri sono generici.
 */
http.route({
  path: "/portal/sign",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const cors = corsHeaders(request.headers.get("Origin"), env.SITE_URL);
    const json = (status: number, body: Record<string, unknown>) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors } });
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return json(400, { ok: false, error: "Richiesta non valida." });
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null) throw new Error("x");
      body = parsed as Record<string, unknown>;
    } catch {
      return json(400, { ok: false, error: "Richiesta non valida." });
    }
    const { token, unlockToken, requestId, fullName, consent, consentVersion } = body;
    if (typeof token !== "string" || typeof unlockToken !== "string" || typeof requestId !== "string" || typeof fullName !== "string" || consent !== true || typeof consentVersion !== "string") {
      return json(400, { ok: false, error: "Richiesta non valida." });
    }
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "sconosciuto";
    try {
      const done = await ctx.runAction(internal.signActions.sign, {
        token,
        unlockToken,
        requestId: requestId as Id<"signatureRequests">,
        fullName,
        consent: true,
        consentVersion,
        ip: ip.slice(0, 64),
        userAgent: (request.headers.get("user-agent") ?? "sconosciuto").slice(0, 200),
      });
      return json(200, { ok: true, signedDocumentId: done.signedDocumentId });
    } catch (error) {
      const data = (error as { data?: { code?: string; message?: string } }).data;
      if (data?.code === "UNLOCK_REQUIRED" || data?.code === "BAD_STATE" || data?.code === "NOT_FOUND") return json(409, { ok: false, code: data.code, error: data.message ?? "Non è stato possibile firmare." });
      return json(500, { ok: false, error: "Non è stato possibile firmare. Riprova tra poco." });
    }
  }),
});

const MAX_WEBHOOK_BYTES = 64 * 1024;

/**
 * Webhook di Resend (esiti di recapito delle email: respinte, segnalate come spam...).
 *
 * Ordine dei controlli (ognuno rifiuta senza dire quale):
 *  1. dimensione del corpo limitata;
 *  2. facoltativo: indirizzo IP del chiamante nell'elenco consentito (WEBHOOK_IP_ALLOWLIST);
 *  3. FIRMA valida (HMAC) con timestamp recente: e' la difesa vera;
 *  4. solo dopo si legge il contenuto; eventi gia' visti (stesso id) non si rielaborano.
 * Senza RESEND_WEBHOOK_SECRET l'endpoint rifiuta tutto.
 */
http.route({
  path: "/webhooks/resend",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const reply = (status: number, body: Record<string, unknown> = {}) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    const unauthorized = () => reply(401, { error: "unauthorized" });

    if (!env.RESEND_WEBHOOK_SECRET) return reply(503, { error: "not_configured" });

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES) return reply(413, { error: "too_large" });
    const raw = await request.text();
    if (raw.length > MAX_WEBHOOK_BYTES) return reply(413, { error: "too_large" });

    if (env.WEBHOOK_IP_ALLOWLIST) {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      if (!isIpAllowed(ip, env.WEBHOOK_IP_ALLOWLIST)) return unauthorized();
    }

    const verification = await verifyWebhook({ secret: env.RESEND_WEBHOOK_SECRET, headers: request.headers, body: raw, nowMs: Date.now() });
    if (!verification.ok) return unauthorized();

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return reply(400, { error: "bad_request" });
    }
    const type = typeof payload === "object" && payload !== null ? (payload as { type?: unknown }).type : undefined;
    if (typeof type !== "string" || !(HANDLED_EVENT_TYPES as readonly string[]).includes(type)) {
      return reply(200, { ok: true, ignored: true });
    }
    const to = (payload as { data?: { to?: unknown } }).data?.to;
    const recipients = Array.isArray(to) ? to.filter((x): x is string => typeof x === "string").slice(0, 5) : [];

    await ctx.runMutation(internal.webhooks.recordResendEvent, { eventId: verification.id, type, recipients });
    return reply(200, { ok: true });
  }),
});

const MAX_B2B_BYTES = 16 * 1024;
const PACKAGES = ["standard", "advanced", "custom"] as const;

/**
 * Trattativa chiusa su b2b.core829.net: crea (o riconosce) il cliente nel portale.
 *
 * Stesse difese dell'endpoint di Resend: dimensione limitata, FIRMA (Standard Webhooks, HMAC-SHA256) con timestamp
 * recente, risposta identica per ogni difetto, nessun dettaglio dell'errore. Senza B2B_WEBHOOK_SECRET rifiuta tutto.
 * Corpo JSON: { dealId, client: { displayName, contactName, email, phone?, vatId?, address?, pec?, legalRep?, website?, packageType? }, notes?, salesAgent? }.
 */
http.route({
  path: "/integrations/b2b/deals",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const reply = (status: number, body: Record<string, unknown> = {}) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    if (!env.B2B_WEBHOOK_SECRET) return reply(503, { error: "not_configured" });

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_B2B_BYTES) return reply(413, { error: "too_large" });
    const raw = await request.text();
    if (raw.length > MAX_B2B_BYTES) return reply(413, { error: "too_large" });

    const verification = await verifyWebhook({ secret: env.B2B_WEBHOOK_SECRET, headers: request.headers, body: raw, nowMs: Date.now() });
    if (!verification.ok) return reply(401, { error: "unauthorized" });

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return reply(400, { error: "bad_request" });
    }
    const str = (x: unknown): string | undefined => (typeof x === "string" && x.trim() !== "" ? x : undefined);
    const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
    const client = typeof body.client === "object" && body.client !== null ? (body.client as Record<string, unknown>) : {};
    const dealId = str(body.dealId);
    const displayName = str(client.displayName);
    const contactName = str(client.contactName);
    const email = str(client.email);
    if (!dealId || !displayName || !contactName || !email) return reply(400, { error: "bad_request" });
    const pkg = PACKAGES.find((p) => p === client.packageType);

    try {
      const result = await ctx.runMutation(internal.b2b.receiveDeal, {
        eventId: verification.id,
        dealId,
        displayName,
        contactName,
        email,
        phone: str(client.phone),
        vatId: str(client.vatId),
        address: str(client.address),
        pec: str(client.pec),
        legalRep: str(client.legalRep),
        website: str(client.website),
        packageType: pkg,
        notes: str(body.notes),
        salesAgent: str(body.salesAgent),
      });
      return reply(200, { ok: true, status: result.status });
    } catch {
      // Dati non validi (email, partita IVA...): 400 generico, senza dire quale campo.
      return reply(400, { error: "bad_request" });
    }
  }),
});

export default http;
