import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { env, type MutationCtx } from "../_generated/server";
import { parseAdminEmails } from "./adminEmails";
import { isNotifyKind, NOTIFY_KINDS, type NotifyData, type NotifyKind, type Rendered } from "./notifyKinds";

export type NotifyInput = {
  /** Obbligatorio per le email al cliente; per quelle all'amministrazione serve a raggruppare nel centro notifiche. */
  clientId?: Id<"clients">;
  data: NotifyData;
  /** Percorso nel portale (inizia con "/") per il pulsante nelle email all'amministrazione. */
  ctaPath?: string;
  attachmentStorageId?: Id<"_storage">;
  attachmentName?: string;
  /** Distingue eventi diversi dello stesso tipo ai fini dell'anti-ripetizione (es. l'id del documento). */
  dedupeSubject?: string;
  /** Se vero la riga e' solo una traccia: l'email e' gia' stata inviata da un altro flusso. */
  logOnly?: boolean;
};

/** Destinatari per l'amministrazione: NOTIFY_ADMIN_EMAILS, altrimenti gli indirizzi autorizzati al login. */
export function adminRecipients(): string[] {
  const own = parseAdminEmails(env.NOTIFY_ADMIN_EMAILS);
  return own.length > 0 ? own : parseAdminEmails(env.ADMIN_EMAILS);
}

/** Percorso valido solo se interno al portale. */
function safePath(p: string | undefined): string | undefined {
  return p && /^\/(?!\/)[A-Za-z0-9/_\-?=&.]*$/.test(p) ? p : undefined;
}

/**
 * Punto unico da cui nascono le email automatiche del portale. Va chiamato DENTRO la mutazione che
 * ha prodotto l'evento (cosi' evento e notifica sono nella stessa transazione). Non lancia mai
 * errori: una notifica non deve far fallire l'azione che l'ha generata.
 * Restituisce il numero di righe accodate.
 */
export async function notify(ctx: MutationCtx, kind: NotifyKind, input: NotifyInput): Promise<number> {
  try {
    if (!isNotifyKind(kind)) return 0;
    const spec = NOTIFY_KINDS[kind];
    const setting = await ctx.db.query("notificationSettings").withIndex("by_kind", (q) => q.eq("kind", kind)).unique();
    if (!(setting ? setting.enabled : spec.defaultEnabled)) return 0;

    const now = Date.now();
    const dedupeMs = "dedupeMs" in spec ? spec.dedupeMs : undefined;
    const dedupeKey = dedupeMs ? `${kind}:${input.dedupeSubject ?? input.clientId ?? ""}` : undefined;
    if (dedupeKey && dedupeMs) {
      const last = await ctx.db
        .query("notifications")
        .withIndex("by_dedupeKey_and_createdAt", (q) => q.eq("dedupeKey", dedupeKey).gt("createdAt", now - dedupeMs))
        .first();
      if (last) return 0;
    }

    const rendered: Rendered = spec.render(input.data);
    const base = {
      kind,
      audience: spec.audience,
      clientId: input.clientId,
      subject: rendered.subject.slice(0, 300),
      heading: rendered.heading.slice(0, 200),
      body: rendered.body.slice(0, 8000),
      ctaLabel: spec.audience === "admin" && input.ctaPath ? rendered.ctaLabel : undefined,
      ctaPath: spec.audience === "admin" ? safePath(input.ctaPath) : undefined,
      attachmentStorageId: input.attachmentStorageId,
      attachmentName: input.attachmentName,
      createdAt: now,
      dedupeKey,
    };

    let recipients: string[] = [];
    let skipReason: string | undefined;
    if (spec.audience === "client") {
      const client = input.clientId ? await ctx.db.get("clients", input.clientId) : null;
      if (!client) skipReason = "Cliente non trovato.";
      else if (client.notifyEmail === false) skipReason = "Email automatiche disattivate per questo cliente.";
      else recipients = [client.email];
    } else {
      recipients = adminRecipients();
      if (recipients.length === 0) skipReason = "Nessun destinatario configurato (NOTIFY_ADMIN_EMAILS o ADMIN_EMAILS).";
    }

    if (skipReason) {
      await ctx.db.insert("notifications", { ...base, to: recipients[0] ?? "", status: "skipped", reason: skipReason });
      return 0;
    }
    for (const to of recipients) {
      if (input.logOnly) {
        await ctx.db.insert("notifications", { ...base, to, status: "sent", sentAt: now, reason: "Inviata dal flusso dedicato." });
        continue;
      }
      const id = await ctx.db.insert("notifications", { ...base, to, status: "queued" });
      await ctx.scheduler.runAfter(0, internal.notifyActions.deliver, { notificationId: id });
    }
    return recipients.length;
  } catch (error) {
    console.error("notify: registrazione non riuscita", kind, error instanceof Error ? error.message : "errore");
    return 0;
  }
}
