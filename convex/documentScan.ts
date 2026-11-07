import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import { sha256Bytes } from "./lib/crypto";
import { inspectFile } from "./lib/files";
import { checkHashReputation } from "./lib/hashReputation";

/**
 * Controllo del contenuto di un file appena caricato. Gira in un'azione separata dalla mutazione di
 * registrazione, cosi' puo' leggere il file intero. Fino alla fine del controllo il documento e' `pending`
 * e non e' scaricabile da nessun cliente.
 */
export const scan = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args): Promise<null> => {
    const document = await ctx.runQuery(internal.documents.getForScan, { documentId: args.documentId });
    if (!document || document.scanStatus !== "pending") return null;

    const reject = (reason: string, sha256?: string) =>
      ctx.runMutation(internal.documents.setScanResult, { documentId: args.documentId, ok: false, reason, sha256 });

    const blob = await ctx.storage.get(document.storageId);
    if (!blob) {
      await reject("File non trovato.");
      return null;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const sha256 = await sha256Bytes(bytes);

    const inspection = inspectFile({ fileName: document.fileName, bytes });
    if (!inspection.ok) {
      await reject(inspection.reason, sha256);
      return null;
    }

    // Controllo facoltativo: l'impronta contro malware noto. Se il servizio non risponde si va avanti
    // (gli altri controlli sono gia' passati) e l'impronta resta salvata per verifiche successive.
    if (env.VIRUSTOTAL_API_KEY) {
      const reputation = await checkHashReputation(env.VIRUSTOTAL_API_KEY, sha256);
      if (reputation === "malicious") {
        await reject("Il file è segnalato come malware.", sha256);
        return null;
      }
    }

    await ctx.runMutation(internal.documents.setScanResult, {
      documentId: args.documentId,
      ok: true,
      sha256,
      mimeType: inspection.mime,
    });
    return null;
  },
});
