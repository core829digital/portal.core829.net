import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";
import { cleanAnnouncement, cleanSeo, dayKey, isSiteLocale, parseTrackedPath, type Announcement } from "./lib/siteConfig";
import { cleanEmail, cleanText } from "./lib/text";

/**
 * Backoffice del sito core829.net dentro il portale.
 * Il sito (repo core829.net-new) invia al portale, FIRMATO, i messaggi del modulo contatti e le visite;
 * il portale gli espone, in sola lettura, la SEO e l'avviso in testata (/site/config).
 */

const messageStatus = v.union(v.literal("new"), v.literal("handled"), v.literal("spam"));

// ---- Dal sito (funzioni interne, chiamate dagli endpoint /site/* dopo la verifica della firma) ----

export const receiveMessage = internalMutation({
  args: {
    eventId: v.string(),
    name: v.string(),
    email: v.string(),
    company: v.optional(v.string()),
    service: v.optional(v.string()),
    budget: v.optional(v.string()),
    message: v.string(),
    locale: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ status: "created" | "duplicate" }> => {
    const seen = await ctx.db
      .query("webhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (seen) return { status: "duplicate" };
    const opt = (s: string | undefined, max: number, field: string) => (s && s.trim() !== "" ? cleanText(s, { field, max }) : undefined);
    const id = await ctx.db.insert("siteMessages", {
      name: cleanText(args.name, { field: "nome", min: 1, max: 200 }),
      email: cleanEmail(args.email),
      company: opt(args.company, 200, "azienda"),
      service: opt(args.service, 100, "servizio"),
      budget: opt(args.budget, 100, "budget"),
      message: cleanText(args.message, { field: "messaggio", min: 1, max: 5000, multiline: true }),
      locale: args.locale && isSiteLocale(args.locale) ? args.locale : undefined,
      status: "new",
      createdAt: Date.now(),
    });
    await ctx.db.insert("webhookEvents", { eventId: args.eventId, type: "site.contact", receivedAt: Date.now() });
    await audit(ctx, { actorType: "system", action: "site.message_received", resourceType: "siteMessage", resourceId: id });
    return { status: "created" };
  },
});

export const recordView = internalMutation({
  args: { path: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const parsed = parseTrackedPath(args.path);
    if (!parsed) return false;
    const day = dayKey(Date.now());
    const row = await ctx.db
      .query("siteStats")
      .withIndex("by_day_and_path_and_locale", (q) => q.eq("day", day).eq("path", parsed.path).eq("locale", parsed.locale))
      .unique();
    if (row) await ctx.db.patch("siteStats", row._id, { views: row.views + 1 });
    else await ctx.db.insert("siteStats", { day, path: parsed.path, locale: parsed.locale, views: 1 });
    return true;
  },
});

/** Cio' che il sito pubblico puo' leggere: solo SEO e avviso. Nessun dato di clienti o messaggi. */
export const publicConfig = internalQuery({
  args: {},
  handler: async (ctx) => {
    const seo = await ctx.db.query("siteSeo").take(500);
    const ann = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "announcement"))
      .unique();
    const a = ann?.value as Announcement | undefined;
    return {
      seo: seo.map((s) => ({ page: s.page, locale: s.locale, title: s.title ?? null, description: s.description ?? null, noindex: s.noindex === true })),
      announcement: a && a.enabled && a.text !== "" ? { text: a.text, href: a.href, cta: a.cta } : null,
    };
  },
});

// ---- Amministratore ----

export const overview = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const days = Math.min(Math.max(1, Math.round(args.days ?? 30)), 90);
    const now = Date.now();
    const from = dayKey(now - (days - 1) * 86_400_000);
    const stats = await ctx.db
      .query("siteStats")
      .withIndex("by_day", (q) => q.gte("day", from))
      .take(8000);
    const byDay = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) byDay.set(dayKey(now - i * 86_400_000), 0);
    const byPath = new Map<string, number>();
    const byLocale = new Map<string, number>();
    let total = 0;
    for (const s of stats) {
      byDay.set(s.day, (byDay.get(s.day) ?? 0) + s.views);
      byPath.set(s.path, (byPath.get(s.path) ?? 0) + s.views);
      byLocale.set(s.locale, (byLocale.get(s.locale) ?? 0) + s.views);
      total += s.views;
    }
    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));
    const newMessages = await ctx.db
      .query("siteMessages")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "new"))
      .take(200);
    const lastMessage = await ctx.db.query("siteMessages").withIndex("by_createdAt").order("desc").first();
    const seoCount = (await ctx.db.query("siteSeo").take(500)).length;
    const ann = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "announcement"))
      .unique();
    return {
      views: total,
      series: [...byDay.entries()].map(([day, value]) => ({ day, value })),
      topPaths: top(byPath),
      topLocales: top(byLocale),
      newMessages: newMessages.length,
      lastMessageAt: lastMessage?.createdAt ?? null,
      seoOverrides: seoCount,
      announcementActive: Boolean((ann?.value as Announcement | undefined)?.enabled),
    };
  },
});

export const messages = query({
  args: { status: v.optional(messageStatus) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const status = args.status;
    const rows =
      status === undefined
        ? await ctx.db.query("siteMessages").withIndex("by_createdAt").order("desc").take(200)
        : await ctx.db
            .query("siteMessages")
            .withIndex("by_status_and_createdAt", (q) => q.eq("status", status))
            .order("desc")
            .take(200);
    return rows.map((m) => ({
      id: m._id,
      name: m.name,
      email: m.email,
      company: m.company ?? null,
      service: m.service ?? null,
      budget: m.budget ?? null,
      message: m.message,
      locale: m.locale ?? null,
      status: m.status,
      createdAt: m.createdAt,
      clientId: m.clientId ?? null,
    }));
  },
});

export const setMessageStatus = mutation({
  args: { messageId: v.id("siteMessages"), status: messageStatus },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const m = await ctx.db.get("siteMessages", args.messageId);
    if (!m) return fail("NOT_FOUND", "Messaggio non trovato.");
    await ctx.db.patch("siteMessages", m._id, { status: args.status, handledAt: args.status === "new" ? undefined : Date.now() });
    await audit(ctx, { actorType: "admin", actorId, action: "site.message_status", resourceType: "siteMessage", resourceId: m._id, metadata: { status: args.status } });
    return null;
  },
});

export const removeMessage = mutation({
  args: { messageId: v.id("siteMessages") },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const m = await ctx.db.get("siteMessages", args.messageId);
    if (!m) return fail("NOT_FOUND", "Messaggio non trovato.");
    await ctx.db.delete("siteMessages", m._id);
    await audit(ctx, { actorType: "admin", actorId, action: "site.message_deleted", resourceType: "siteMessage", resourceId: args.messageId });
    return null;
  },
});

/** Dalla richiesta al cliente: crea la scheda cliente (stato «onboarding») e segna il messaggio come gestito. */
export const messageToClient = mutation({
  args: { messageId: v.id("siteMessages") },
  handler: async (ctx, args): Promise<Id<"clients">> => {
    const { actorId } = await requireAdmin(ctx);
    const m = await ctx.db.get("siteMessages", args.messageId);
    if (!m) return fail("NOT_FOUND", "Messaggio non trovato.");
    if (m.clientId && (await ctx.db.get("clients", m.clientId))) return m.clientId;
    const existing = await ctx.db
      .query("clients")
      .withIndex("by_email", (q) => q.eq("email", m.email))
      .first();
    const clientId =
      existing?._id ??
      (await ctx.db.insert("clients", {
        displayName: m.company ?? m.name,
        contactName: m.name,
        email: m.email,
        packageType: "standard",
        status: "onboarding",
        internalNotes: cleanText(`Da modulo contatti core829.net${m.service ? ` · servizio: ${m.service}` : ""}${m.budget ? ` · budget: ${m.budget}` : ""}\n${m.message}`, { field: "note", max: 4000, multiline: true }),
      }));
    await ctx.db.patch("siteMessages", m._id, { clientId, status: "handled", handledAt: Date.now() });
    await audit(ctx, { actorType: "admin", actorId, clientId, action: "site.message_to_client", resourceType: "siteMessage", resourceId: m._id, metadata: { reused: existing !== null } });
    return clientId;
  },
});

export const seoList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("siteSeo").take(500);
    return rows.map((r) => ({ page: r.page, locale: r.locale, title: r.title ?? "", description: r.description ?? "", noindex: r.noindex === true }));
  },
});

export const seoSave = mutation({
  args: { page: v.string(), locale: v.string(), title: v.optional(v.string()), description: v.optional(v.string()), noindex: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const data = cleanSeo(args.page, args.locale, args);
    const existing = await ctx.db
      .query("siteSeo")
      .withIndex("by_page_and_locale", (q) => q.eq("page", data.page).eq("locale", data.locale))
      .unique();
    if (!data.title && !data.description && !data.noindex) {
      if (existing) await ctx.db.delete("siteSeo", existing._id); // tutto vuoto = si torna al testo predefinito del sito
    } else if (existing) await ctx.db.replace("siteSeo", existing._id, { ...data, updatedAt: Date.now() });
    else await ctx.db.insert("siteSeo", { ...data, updatedAt: Date.now() });
    await audit(ctx, { actorType: "admin", actorId, action: "site.seo_saved", resourceType: "siteSeo", metadata: { page: data.page, locale: data.locale } });
    return null;
  },
});

export const announcementGet = query({
  args: {},
  handler: async (ctx): Promise<Announcement> => {
    await requireAdmin(ctx);
    const row = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "announcement"))
      .unique();
    return (row?.value as Announcement | undefined) ?? { enabled: false, text: "", href: "", cta: "" };
  },
});

export const announcementSave = mutation({
  args: { enabled: v.boolean(), text: v.string(), href: v.string(), cta: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const value = cleanAnnouncement(args);
    const row = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "announcement"))
      .unique();
    if (row) await ctx.db.patch("siteSettings", row._id, { value, updatedAt: Date.now() });
    else await ctx.db.insert("siteSettings", { key: "announcement", value, updatedAt: Date.now() });
    await audit(ctx, { actorType: "admin", actorId, action: "site.announcement_saved", resourceType: "siteSettings", metadata: { enabled: value.enabled } });
    return null;
  },
});


// ---- Risposte alle richieste (email da clients@core829.net) ----

/** Invia la risposta al visitatore. L'email parte subito dopo (azione separata); la richiesta passa a «gestita». */
export const reply = mutation({
  args: { messageId: v.id("siteMessages"), subject: v.string(), body: v.string() },
  handler: async (ctx, args): Promise<Id<"siteReplies">> => {
    const { actorId } = await requireAdmin(ctx);
    const m = await ctx.db.get("siteMessages", args.messageId);
    if (!m) return fail("NOT_FOUND", "Richiesta non trovata.");
    const subject = cleanText(args.subject, { field: "oggetto", min: 3, max: 150 });
    const body = cleanText(args.body, { field: "messaggio", min: 5, max: 5000, multiline: true });
    const id = await ctx.db.insert("siteReplies", { messageId: m._id, to: m.email, subject, body, status: "queued", createdAt: Date.now(), actorId });
    if (m.status === "new") await ctx.db.patch("siteMessages", m._id, { status: "handled", handledAt: Date.now() });
    await audit(ctx, { actorType: "admin", actorId, action: "site.reply_sent", resourceType: "siteMessage", resourceId: m._id });
    await ctx.scheduler.runAfter(0, internal.siteMail.deliver, { replyId: id });
    return id;
  },
});

export const repliesFor = query({
  args: { messageId: v.id("siteMessages") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("siteReplies")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .order("desc")
      .take(20);
    return rows.map((r) => ({ id: r._id, subject: r.subject, body: r.body, status: r.status, createdAt: r.createdAt, sentAt: r.sentAt ?? null }));
  },
});

/** Riprova un invio non riuscito. */
export const retryReply = mutation({
  args: { replyId: v.id("siteReplies") },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const r = await ctx.db.get("siteReplies", args.replyId);
    if (!r) return fail("NOT_FOUND", "Risposta non trovata.");
    if (r.status !== "failed") return fail("BAD_STATE", "Questa risposta non è da rinviare.");
    await ctx.db.patch("siteReplies", r._id, { status: "queued" });
    await audit(ctx, { actorType: "admin", actorId, action: "site.reply_retry", resourceType: "siteReply", resourceId: r._id });
    await ctx.scheduler.runAfter(0, internal.siteMail.deliver, { replyId: r._id });
    return null;
  },
});

export const replyForDelivery = internalQuery({
  args: { replyId: v.id("siteReplies") },
  handler: async (ctx, args) => {
    const r = await ctx.db.get("siteReplies", args.replyId);
    if (!r || r.status !== "queued") return null;
    return { to: r.to, subject: r.subject, body: r.body };
  },
});

export const replyResult = internalMutation({
  args: { replyId: v.id("siteReplies"), ok: v.boolean() },
  handler: async (ctx, args): Promise<null> => {
    const r = await ctx.db.get("siteReplies", args.replyId);
    if (!r) return null;
    await ctx.db.patch("siteReplies", r._id, args.ok ? { status: "sent", sentAt: Date.now() } : { status: "failed" });
    return null;
  },
});
