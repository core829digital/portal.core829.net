import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";
import { adminRecipients } from "./lib/notify";
import { isNotifyKind, KIND_LIST, NOTIFY_KINDS } from "./lib/notifyKinds";

/** Centro notifiche: registro di tutte le email automatiche e impostazioni per tipo. Solo amministratori. */

const statusArg = v.union(v.literal("queued"), v.literal("sent"), v.literal("failed"), v.literal("skipped"));
const LIMIT = 200;

export const list = query({
  args: { clientId: v.optional(v.id("clients")), status: v.optional(statusArg), audience: v.optional(v.union(v.literal("client"), v.literal("admin"))) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows: Doc<"notifications">[] = args.clientId
      ? await ctx.db.query("notifications").withIndex("by_clientId_and_createdAt", (q) => q.eq("clientId", args.clientId)).order("desc").take(LIMIT)
      : args.status
        ? await ctx.db.query("notifications").withIndex("by_status_and_createdAt", (q) => q.eq("status", args.status!)).order("desc").take(LIMIT)
        : await ctx.db.query("notifications").withIndex("by_createdAt").order("desc").take(LIMIT);
    const filtered = rows.filter((r) => (args.status ? r.status === args.status : true) && (args.audience ? r.audience === args.audience : true));
    const names = new Map<string, string>();
    for (const r of filtered) {
      if (r.clientId && !names.has(r.clientId)) names.set(r.clientId, (await ctx.db.get("clients", r.clientId))?.displayName ?? "Cliente eliminato");
    }
    return filtered.map((r) => ({
      _id: r._id,
      kind: r.kind,
      label: isNotifyKind(r.kind) ? NOTIFY_KINDS[r.kind].label : r.kind,
      audience: r.audience,
      clientId: r.clientId ?? null,
      clientName: r.clientId ? (names.get(r.clientId) ?? null) : null,
      to: r.to,
      subject: r.subject,
      body: r.body,
      status: r.status,
      reason: r.reason ?? null,
      hasAttachment: r.attachmentStorageId !== undefined,
      createdAt: r.createdAt,
      sentAt: r.sentAt ?? null,
    }));
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const count = async (status: "queued" | "sent" | "failed" | "skipped") =>
      (await ctx.db.query("notifications").withIndex("by_status_and_createdAt", (q) => q.eq("status", status)).take(1000)).length;
    const [queued, sent, failed, skipped] = await Promise.all([count("queued"), count("sent"), count("failed"), count("skipped")]);
    return { queued, sent, failed, skipped, adminRecipients: adminRecipients().length };
  },
});

export const settings = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("notificationSettings").take(200);
    const byKind = new Map(rows.map((r) => [r.kind, r.enabled]));
    return KIND_LIST.map((k) => ({ kind: k.kind, audience: k.audience, label: k.label, description: k.description, enabled: byKind.get(k.kind) ?? k.defaultEnabled, defaultEnabled: k.defaultEnabled }));
  },
});

export const setEnabled = mutation({
  args: { kind: v.string(), enabled: v.boolean() },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    if (!isNotifyKind(args.kind)) return fail("BAD_STATE", "Tipo di notifica sconosciuto.");
    const row = await ctx.db.query("notificationSettings").withIndex("by_kind", (q) => q.eq("kind", args.kind)).unique();
    if (row) await ctx.db.patch("notificationSettings", row._id, { enabled: args.enabled });
    else await ctx.db.insert("notificationSettings", { kind: args.kind, enabled: args.enabled });
    await audit(ctx, { actorType: "admin", actorId, action: "notification.setting_changed", resourceType: "notificationKind", resourceId: args.kind, metadata: { enabled: args.enabled } });
    return null;
  },
});

/** Rimette in coda un invio fallito. */
export const retry = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args): Promise<null> => {
    const { actorId } = await requireAdmin(ctx);
    const n = await ctx.db.get("notifications", args.notificationId);
    if (!n) return fail("NOT_FOUND", "Notifica non trovata.");
    if (n.status !== "failed") return fail("BAD_STATE", "Si possono rinviare solo le notifiche non riuscite.");
    await ctx.db.patch("notifications", n._id, { status: "queued", reason: undefined });
    await ctx.scheduler.runAfter(0, internal.notifyActions.deliver, { notificationId: n._id });
    await audit(ctx, { actorType: "admin", actorId, clientId: n.clientId, action: "notification.retried", resourceType: "notification", resourceId: n._id });
    return null;
  },
});

export const forDelivery = internalQuery({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const n = await ctx.db.get("notifications", args.notificationId);
    if (!n || n.status !== "queued") return null;
    return { audience: n.audience, to: n.to, subject: n.subject, heading: n.heading, body: n.body, ctaLabel: n.ctaLabel ?? null, ctaPath: n.ctaPath ?? null, attachmentStorageId: n.attachmentStorageId ?? null, attachmentName: n.attachmentName ?? null };
  },
});

export const result = internalMutation({
  args: { notificationId: v.id("notifications"), ok: v.boolean(), reason: v.optional(v.string()) },
  handler: async (ctx, args): Promise<null> => {
    const n = await ctx.db.get("notifications", args.notificationId);
    if (!n) return null;
    await ctx.db.patch("notifications", n._id, args.ok ? { status: "sent", sentAt: Date.now(), reason: undefined } : { status: "failed", reason: args.reason ?? "Invio non riuscito." });
    return null;
  },
});
