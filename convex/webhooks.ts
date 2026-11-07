import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { audit } from "./lib/audit";
import { cleanEmail } from "./lib/text";

/** Tipi di evento che ci interessano. Tutti gli altri si accettano (200, cosi' il mittente non riprova) e si ignorano. */
export const HANDLED_EVENT_TYPES = ["email.delivered", "email.delivery_delayed", "email.bounced", "email.complained", "email.failed"] as const;

/** Eventi che indicano un problema di recapito: si segnalano nel registro del cliente. */
const PROBLEM_EVENTS = new Set(["email.bounced", "email.complained", "email.failed", "email.delivery_delayed"]);

/**
 * Registra un evento di Resend. Interna: la chiama solo l'endpoint /webhooks/resend dopo aver verificato la firma.
 * Idempotente: lo stesso `eventId` (un messaggio ripetuto, anche da un attaccante che lo ha intercettato)
 * viene elaborato una volta sola.
 *
 * Nel registro non finisce l'indirizzo email: solo il tipo di evento e il cliente a cui si riferisce.
 */
export const recordResendEvent = internalMutation({
  args: { eventId: v.string(), type: v.string(), recipients: v.array(v.string()) },
  handler: async (ctx, args) => {
    const seen = await ctx.db
      .query("webhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();
    if (seen) return { duplicate: true as const };

    await ctx.db.insert("webhookEvents", { eventId: args.eventId, type: args.type, receivedAt: Date.now() });

    if (PROBLEM_EVENTS.has(args.type)) {
      for (const raw of args.recipients.slice(0, 3)) {
        let email: string;
        try {
          email = cleanEmail(raw);
        } catch {
          continue; // un indirizzo non valido nel messaggio non deve far fallire l'evento
        }
        const client = await ctx.db
          .query("clients")
          .withIndex("by_email", (q) => q.eq("email", email))
          .first();
        if (client) {
          await audit(ctx, { actorType: "system", clientId: client._id, action: args.type, resourceType: "email" });
        }
      }
    }
    return { duplicate: false as const };
  },
});
