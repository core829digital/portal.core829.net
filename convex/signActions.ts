"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { fail } from "./lib/errors";
import { appendSignatureCertificate, CONSENT_VERSION, cleanSignerName, sha256Hex } from "./lib/signature";

/**
 * Il cliente firma. Chiamata SOLO dall'endpoint /portal/sign (che aggiunge IP e browser).
 *  1. `begin`: link valido, codice confermato da meno di 10 minuti, richiesta del cliente e ancora valida; la blocca (nessuna doppia firma);
 *  2. si verifica che il PDF sia ancora quello della richiesta (impronta SHA-256);
 *  3. si aggiunge il certificato di firma in coda e si archivia la copia firmata;
 *  4. `finish` registra le prove. Se qualcosa va storto la richiesta torna disponibile.
 */
export const sign = internalAction({
  args: {
    token: v.string(),
    unlockToken: v.string(),
    requestId: v.id("signatureRequests"),
    fullName: v.string(),
    consent: v.boolean(),
    consentVersion: v.string(),
    ip: v.string(),
    userAgent: v.string(),
  },
  handler: async (ctx, args): Promise<{ signedDocumentId: string }> => {
    if (args.consent !== true || args.consentVersion !== CONSENT_VERSION) return fail("BAD_STATE", "Devi accettare le dichiarazioni per firmare.");
    const signerName = cleanSignerName(args.fullName);
    if (!signerName) return fail("BAD_STATE", "Scrivi il tuo nome e cognome per esteso (solo lettere).");

    const started = await ctx.runMutation(internal.signatures.begin, { token: args.token, unlockToken: args.unlockToken, requestId: args.requestId });
    try {
      const blob = await ctx.storage.get(started.storageId);
      if (!blob) return fail("NOT_FOUND", "File non trovato.");
      const original = new Uint8Array(await blob.arrayBuffer());
      if ((await sha256Hex(original)) !== started.docSha256) return fail("BAD_STATE", "Il documento è cambiato dopo la richiesta di firma: CORE829 deve inviarne una nuova richiesta.");
      const signedAt = Date.now();
      const signedBytes = await appendSignatureCertificate(original, {
        requestId: args.requestId,
        documentTitle: started.title,
        docSha256: started.docSha256,
        signerName,
        signerEmail: started.signerEmail,
        signedAt,
        otpVerifiedAt: started.otpVerifiedAt,
        ip: args.ip.slice(0, 64),
        userAgent: args.userAgent.slice(0, 200),
        consentVersion: CONSENT_VERSION,
      });
      const storageId = await ctx.storage.store(new Blob([signedBytes as BlobPart], { type: "application/pdf" }));
      const baseName = started.fileName.replace(/\.pdf$/i, "");
      const done = await ctx.runMutation(internal.signatures.finish, {
        requestId: args.requestId,
        storageId,
        sizeBytes: signedBytes.length,
        signedSha256: await sha256Hex(signedBytes),
        signedName: signerName,
        ip: args.ip.slice(0, 64),
        userAgent: args.userAgent.slice(0, 200),
        otpVerifiedAt: started.otpVerifiedAt,
        consentVersion: CONSENT_VERSION,
        title: started.title,
        fileName: `${baseName}-firmato.pdf`,
        kind: started.kind,
      });
      return { signedDocumentId: done.signedDocumentId };
    } catch (error) {
      await ctx.runMutation(internal.signatures.release, { requestId: args.requestId });
      throw error;
    }
  },
});
