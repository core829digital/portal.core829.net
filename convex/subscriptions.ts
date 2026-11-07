import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";
import { MAX_REMINDER_DAYS } from "./lib/reminders";
import { assertCents, assertIntInRange, assertTimestamp, cleanText } from "./lib/text";
import { subscriptionInterval, subscriptionStatus } from "./lib/validators";

const nullableString = v.optional(v.union(v.string(), v.null()));
const nullableNumber = v.optional(v.union(v.number(), v.null()));

export const create = mutation({
  args: {
    clientId: v.id("clients"),
    name: v.string(),
    description: v.optional(v.string()),
    amountCents: v.number(),
    interval: subscriptionInterval,
    startedAt: v.number(),
    nextRenewalAt: v.optional(v.number()),
    /** Giorni di anticipo del promemoria email al cliente (richiede `nextRenewalAt`). */
    reminderDaysBefore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    if (args.reminderDaysBefore !== undefined && args.nextRenewalAt === undefined) {
      return fail("BAD_STATE", "Per il promemoria serve la data del prossimo rinnovo.");
    }
    const client = await ctx.db.get("clients", args.clientId);
    if (!client) return fail("NOT_FOUND", "Cliente non trovato.");

    const subscriptionId = await ctx.db.insert("subscriptions", {
      clientId: args.clientId,
      name: cleanText(args.name, { field: "nome abbonamento", min: 1, max: 120 }),
      description:
        args.description === undefined
          ? undefined
          : cleanText(args.description, { field: "descrizione", max: 500, multiline: true }),
      amountCents: assertCents(args.amountCents),
      currency: "EUR",
      interval: args.interval,
      status: "active",
      startedAt: assertTimestamp(args.startedAt, "data di inizio"),
      nextRenewalAt: args.nextRenewalAt === undefined ? undefined : assertTimestamp(args.nextRenewalAt, "prossimo rinnovo"),
      reminderDaysBefore:
        args.reminderDaysBefore === undefined
          ? undefined
          : assertIntInRange(args.reminderDaysBefore, 1, MAX_REMINDER_DAYS, "giorni di anticipo"),
    });
    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: args.clientId,
      action: "subscription.created",
      resourceType: "subscription",
      resourceId: subscriptionId,
      metadata: { amountCents: args.amountCents, interval: args.interval },
    });
    return subscriptionId;
  },
});

export const update = mutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    name: v.optional(v.string()),
    description: nullableString,
    amountCents: v.optional(v.number()),
    interval: v.optional(subscriptionInterval),
    nextRenewalAt: nullableNumber,
    reminderDaysBefore: nullableNumber,
  },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const subscription = await ctx.db.get("subscriptions", args.subscriptionId);
    if (!subscription) return fail("NOT_FOUND", "Abbonamento non trovato.");
    if (subscription.status === "cancelled") return fail("BAD_STATE", "Abbonamento già annullato.");

    const patch: Partial<Omit<Doc<"subscriptions">, "_id" | "_creationTime" | "clientId">> = {};
    if (args.name !== undefined) patch.name = cleanText(args.name, { field: "nome abbonamento", min: 1, max: 120 });
    if (args.description !== undefined) {
      patch.description =
        args.description === null ? undefined : cleanText(args.description, { field: "descrizione", max: 500, multiline: true });
    }
    if (args.amountCents !== undefined) patch.amountCents = assertCents(args.amountCents);
    if (args.interval !== undefined) patch.interval = args.interval;
    if (args.nextRenewalAt !== undefined) {
      patch.nextRenewalAt = args.nextRenewalAt === null ? undefined : assertTimestamp(args.nextRenewalAt, "prossimo rinnovo");
    }
    if (args.reminderDaysBefore !== undefined) {
      patch.reminderDaysBefore =
        args.reminderDaysBefore === null
          ? undefined
          : assertIntInRange(args.reminderDaysBefore, 1, MAX_REMINDER_DAYS, "giorni di anticipo");
    }

    const fields = Object.keys(patch);
    if (fields.length === 0) return null;
    await ctx.db.patch("subscriptions", args.subscriptionId, patch);
    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: subscription.clientId,
      action: "subscription.updated",
      resourceType: "subscription",
      resourceId: args.subscriptionId,
      metadata: { fields: fields.join(",") },
    });
    return null;
  },
});

export const setStatus = mutation({
  args: { subscriptionId: v.id("subscriptions"), status: subscriptionStatus },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const subscription = await ctx.db.get("subscriptions", args.subscriptionId);
    if (!subscription) return fail("NOT_FOUND", "Abbonamento non trovato.");
    // Un abbonamento annullato non si riattiva: se ne crea uno nuovo.
    if (subscription.status === "cancelled") return fail("BAD_STATE", "Abbonamento già annullato.");
    const patch: Partial<Doc<"subscriptions">> = { status: args.status };
    if (args.status === "cancelled") {
      patch.cancelledAt = Date.now();
      patch.nextRenewalAt = undefined;
    }
    await ctx.db.patch("subscriptions", args.subscriptionId, patch);
    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: subscription.clientId,
      action: "subscription.status_changed",
      resourceType: "subscription",
      resourceId: args.subscriptionId,
      metadata: { from: subscription.status, to: args.status },
    });
    return null;
  },
});

export const listByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(100);
  },
});
