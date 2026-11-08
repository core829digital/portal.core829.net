"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, env } from "./_generated/server";
import { COMPANY } from "./lib/autofill";
import { fail } from "./lib/errors";
import { sendEmail } from "./lib/resend";
import { appendSignatureCertificate, CONSENT_VERSION, cleanSignerName, sha256Hex } from "./lib/signature";
import { escapeHtml } from "./lib/text";

const FRAME = (inner: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937"><p style="font-size:13px;letter-spacing:2px;color:#c2410c;font-weight:bold;margin:0">CORE829</p>${inner}<p style="font-size:13px;line-height:20px;color:#6b7280">${COMPANY.name} · ${COMPANY.address} · CUI/CIF ${COMPANY.cui}</p></div>`;

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
      await ctx.scheduler.runAfter(0, internal.signActions.notifySigned, { requestId: args.requestId });
      return { signedDocumentId: done.signedDocumentId };
    } catch (error) {
      await ctx.runMutation(internal.signatures.release, { requestId: args.requestId });
      throw error;
    }
  },
});

/** Email al cliente: c'è un documento da firmare. Non contiene il link personale (non si puo' ricostruire): rimanda a quello gia' ricevuto. */
export const notifyRequested = internalAction({
  args: { requestId: v.id("signatureRequests") },
  handler: async (ctx, args): Promise<null> => {
    if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) return null;
    const d = await ctx.runMutation(internal.signatures.emailData, args);
    if (!d) return null;
    const until = new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeZone: "Europe/Rome" }).format(new Date(d.expiresAt));
    try {
      await sendEmail(env.RESEND_API_KEY, {
        from: env.AUTH_EMAIL_FROM,
        to: d.email,
        subject: `Da firmare: ${d.title}`,
        text: `Buongiorno,\n\nCORE829 le ha inviato un documento da firmare: «${d.title}».\n\nApra il suo link personale al portale clienti, vada in «Documenti» e prema «Firma». Serve un codice che le arriverà per email.\nLa richiesta è valida fino al ${until}.\n\nCORE829 SRL`,
        html: FRAME(`<p style="font-size:16px;line-height:24px">Buongiorno,<br/>CORE829 le ha inviato un documento da firmare: <strong>${escapeHtml(d.title)}</strong>.</p><p style="font-size:15px;line-height:22px">Apra il suo <strong>link personale</strong> al portale clienti, vada in <strong>Documenti</strong> e prema <strong>Firma</strong>. Serve un codice che le arriverà per email.<br/>La richiesta è valida fino al ${escapeHtml(until)}.</p>`),
        replyTo: "office@core829.net",
      });
    } catch {
      // L'email e' un avviso: se non parte, la richiesta resta valida e visibile nel portale.
    }
    return null;
  },
});

/** Conferma di firma: copia firmata al cliente e a CORE829. */
export const notifySigned = internalAction({
  args: { requestId: v.id("signatureRequests") },
  handler: async (ctx, args): Promise<null> => {
    if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) return null;
    const d = await ctx.runMutation(internal.signatures.emailData, args);
    if (!d || !d.signedStorageId) return null;
    const blob = await ctx.storage.get(d.signedStorageId);
    if (!blob) return null;
    const attachments = [{ filename: "documento-firmato.pdf", content: Buffer.from(await blob.arrayBuffer()).toString("base64") }];
    const who = d.signedName ?? d.clientName;
    for (const [to, intro] of [
      [d.email, `Grazie, ${escapeHtml(who)}: il documento «${escapeHtml(d.title)}» è stato firmato. In allegato trova la copia firmata, che resta sempre disponibile anche nel portale.`],
      ["office@core829.net", `${escapeHtml(who)} (${escapeHtml(d.clientName)}) ha firmato «${escapeHtml(d.title)}». Copia firmata in allegato.`],
    ] as const) {
      try {
        await sendEmail(env.RESEND_API_KEY, {
          from: env.AUTH_EMAIL_FROM,
          to,
          subject: `Firmato: ${d.title}`,
          text: intro.replace(/<[^>]+>/g, ""),
          html: FRAME(`<p style="font-size:16px;line-height:24px">${intro}</p>`),
          attachments,
        });
      } catch {
        // Copia comunque archiviata nel portale.
      }
    }
    return null;
  },
});
