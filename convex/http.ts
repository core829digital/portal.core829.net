import { httpRouter } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { env, httpAction } from "./_generated/server";
import { corsHeaders } from "./lib/cors";
import { contentDisposition } from "./lib/files";

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

export default http;
