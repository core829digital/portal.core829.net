import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { env, internalAction, internalMutation } from "./_generated/server";
import { parseAdminEmails } from "./lib/adminEmails";
import { audit } from "./lib/audit";
import { sendEmail } from "./lib/resend";
import { cleanEmail, cleanPhone, cleanText, cleanVatId, escapeHtml } from "./lib/text";
import { packageType } from "./lib/validators";

/**
 * Passaggio delle trattative da b2b.core829.net al portale.
 * L'endpoint HTTP (`/integrations/b2b/deals` in http.ts) verifica la firma; qui si crea il cliente.
 *  - idempotente: lo stesso evento (o la stessa trattativa) non crea due volte lo stesso cliente;
 *  - se esiste gia' un cliente con quell'email si usa quello (non si sovrascrive nulla);
 *  - il cliente nasce in stato "In avvio": a quel punto l'amministratore crea il contratto dai modelli.
 */

export const receiveDeal = internalMutation({
  args: {
    eventId: v.string(),
    dealId: v.string(),
    displayName: v.string(),
    contactName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    vatId: v.optional(v.string()),
    packageType: v.optional(packageType),
    notes: v.optional(v.string()),
    salesAgent: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ status: "created" | "exists" | "duplicate"; clientId: Id<"clients"> | null }> => {
    const seen = await ctx.db
      .query("webhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();
    if (seen) return { status: "duplicate", clientId: null };
    await ctx.db.insert("webhookEvents", { eventId: args.eventId, type: "b2b.deal", receivedAt: Date.now() });

    const email = cleanEmail(args.email);
    const dealId = cleanText(args.dealId, { field: "trattativa", min: 1, max: 80 });
    const agent = args.salesAgent ? cleanText(args.salesAgent, { field: "agente", max: 80 }) : null;
    const origin = `Origine: b2b.core829.net, trattativa ${dealId}${agent ? `, agente ${agent}` : ""}.`;

    const existing = await ctx.db
      .query("clients")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing) {
      await audit(ctx, { actorType: "system", clientId: existing._id, action: "b2b.deal_received", resourceType: "client", resourceId: existing._id, metadata: { created: false } });
      await ctx.scheduler.runAfter(0, internal.b2b.notifyAdmins, { clientId: existing._id, created: false, dealId });
      return { status: "exists", clientId: existing._id };
    }

    const notes = args.notes ? cleanText(args.notes, { field: "note", max: 3000, multiline: true }) : "";
    const clientId = await ctx.db.insert("clients", {
      displayName: cleanText(args.displayName, { field: "nome", min: 1, max: 120 }),
      contactName: cleanText(args.contactName, { field: "referente", min: 1, max: 120 }),
      email,
      phone: args.phone ? cleanPhone(args.phone) : undefined,
      vatId: args.vatId ? cleanVatId(args.vatId) : undefined,
      packageType: args.packageType ?? "custom",
      status: "onboarding",
      internalNotes: notes ? `${origin}\n${notes}` : origin,
    });
    await audit(ctx, { actorType: "system", clientId, action: "b2b.deal_received", resourceType: "client", resourceId: clientId, metadata: { created: true } });
    await ctx.scheduler.runAfter(0, internal.b2b.notifyAdmins, { clientId, created: true, dealId });
    return { status: "created", clientId };
  },
});

/** Avvisa gli amministratori via email: c'e' una nuova trattativa da trasformare in contratto. */
export const notifyAdmins = internalAction({
  args: { clientId: v.id("clients"), created: v.boolean(), dealId: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const admins = parseAdminEmails(env.ADMIN_EMAILS);
    if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM || admins.length === 0) return null;
    const base = (env.SITE_URL ?? "").split(",")[0]?.trim().replace(/\/+$/, "") ?? "";
    const link = base ? `${base}/admin/clients/${args.clientId}/contracts` : "";
    const title = args.created ? "Nuova trattativa dal B2B: cliente creato" : "Trattativa dal B2B per un cliente già presente";
    const text = `${title}.\nTrattativa: ${args.dealId}\n${link ? `Crea il contratto: ${link}` : "Apri il portale e crea il contratto dai modelli."}`;
    const html =
      `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937">` +
      `<p style="font-size:13px;letter-spacing:2px;color:#c2410c;font-weight:bold;margin:0">CORE829</p>` +
      `<p style="font-size:16px;line-height:24px"><strong>${escapeHtml(title)}</strong></p>` +
      `<p style="font-size:14px;line-height:22px">Trattativa: ${escapeHtml(args.dealId)}</p>` +
      (link ? `<p><a href="${escapeHtml(link)}" style="color:#dd1a2b">Crea il contratto dai modelli</a></p>` : "") +
      `</div>`;
    for (const to of admins) {
      try {
        await sendEmail(env.RESEND_API_KEY, { from: env.AUTH_EMAIL_FROM, to, subject: title, text, html });
      } catch {
        console.error("Avviso trattativa B2B non inviato a un amministratore.");
      }
    }
    return null;
  },
});
