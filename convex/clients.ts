import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";
import { cleanEmail, cleanPhone, cleanText, cleanVatId } from "./lib/text";
import { clientStatus, packageType } from "./lib/validators";

const nullableString = v.optional(v.union(v.string(), v.null()));

export const create = mutation({
  args: {
    displayName: v.string(),
    contactName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    vatId: v.optional(v.string()),
    address: v.optional(v.string()),
    pec: v.optional(v.string()),
    legalRep: v.optional(v.string()),
    website: v.optional(v.string()),
    packageType,
    welcomeMessage: v.optional(v.string()),
    internalNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const email = cleanEmail(args.email);
    const existing = await ctx.db
      .query("clients")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing) return fail("CONFLICT", "Esiste già un cliente con questa email.");

    const clientId = await ctx.db.insert("clients", {
      displayName: cleanText(args.displayName, { field: "nome", min: 1, max: 120 }),
      contactName: cleanText(args.contactName, { field: "referente", min: 1, max: 120 }),
      email,
      phone: args.phone === undefined ? undefined : cleanPhone(args.phone),
      vatId: args.vatId === undefined ? undefined : cleanVatId(args.vatId),
      address: args.address === undefined ? undefined : cleanText(args.address, { field: "sede legale", max: 200 }),
      pec: args.pec === undefined ? undefined : cleanEmail(args.pec, "PEC"),
      legalRep: args.legalRep === undefined ? undefined : cleanText(args.legalRep, { field: "rappresentante legale", max: 120 }),
      website: args.website === undefined ? undefined : cleanText(args.website, { field: "sito web", max: 200 }),
      packageType: args.packageType,
      status: "onboarding",
      welcomeMessage:
        args.welcomeMessage === undefined
          ? undefined
          : cleanText(args.welcomeMessage, { field: "messaggio di benvenuto", max: 1000, multiline: true }),
      internalNotes:
        args.internalNotes === undefined
          ? undefined
          : cleanText(args.internalNotes, { field: "note interne", max: 4000, multiline: true }),
    });
    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId,
      action: "client.created",
      resourceType: "client",
      resourceId: clientId,
    });
    return clientId;
  },
});

export const update = mutation({
  args: {
    clientId: v.id("clients"),
    displayName: v.optional(v.string()),
    contactName: v.optional(v.string()),
    email: v.optional(v.string()),
    // `null` cancella il campo, `undefined` lo lascia com'e'.
    phone: nullableString,
    vatId: nullableString,
    address: nullableString,
    pec: nullableString,
    legalRep: nullableString,
    website: nullableString,
    packageType: v.optional(packageType),
    status: v.optional(clientStatus),
    notifyEmail: v.optional(v.boolean()),
    welcomeMessage: nullableString,
    internalNotes: nullableString,
  },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const client = await ctx.db.get("clients", args.clientId);
    if (!client) return fail("NOT_FOUND", "Cliente non trovato.");

    const patch: Partial<Omit<Doc<"clients">, "_id" | "_creationTime">> = {};
    if (args.displayName !== undefined) patch.displayName = cleanText(args.displayName, { field: "nome", min: 1, max: 120 });
    if (args.contactName !== undefined) patch.contactName = cleanText(args.contactName, { field: "referente", min: 1, max: 120 });
    if (args.email !== undefined) {
      const email = cleanEmail(args.email);
      if (email !== client.email) {
        const clash = await ctx.db
          .query("clients")
          .withIndex("by_email", (q) => q.eq("email", email))
          .first();
        if (clash) return fail("CONFLICT", "Esiste già un cliente con questa email.");
      }
      patch.email = email;
    }
    if (args.phone !== undefined) patch.phone = args.phone === null ? undefined : cleanPhone(args.phone);
    if (args.vatId !== undefined) patch.vatId = args.vatId === null ? undefined : cleanVatId(args.vatId);
    if (args.address !== undefined) patch.address = args.address === null ? undefined : cleanText(args.address, { field: "sede legale", max: 200 });
    if (args.pec !== undefined) patch.pec = args.pec === null ? undefined : cleanEmail(args.pec, "PEC");
    if (args.legalRep !== undefined) patch.legalRep = args.legalRep === null ? undefined : cleanText(args.legalRep, { field: "rappresentante legale", max: 120 });
    if (args.website !== undefined) patch.website = args.website === null ? undefined : cleanText(args.website, { field: "sito web", max: 200 });
    if (args.packageType !== undefined) patch.packageType = args.packageType;
    if (args.status !== undefined) patch.status = args.status;
    if (args.notifyEmail !== undefined) patch.notifyEmail = args.notifyEmail;
    if (args.welcomeMessage !== undefined) {
      patch.welcomeMessage =
        args.welcomeMessage === null
          ? undefined
          : cleanText(args.welcomeMessage, { field: "messaggio di benvenuto", max: 1000, multiline: true });
    }
    if (args.internalNotes !== undefined) {
      patch.internalNotes =
        args.internalNotes === null
          ? undefined
          : cleanText(args.internalNotes, { field: "note interne", max: 4000, multiline: true });
    }

    const fields = Object.keys(patch);
    if (fields.length === 0) return null;
    await ctx.db.patch("clients", args.clientId, patch);
    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: args.clientId,
      action: "client.updated",
      resourceType: "client",
      resourceId: args.clientId,
      metadata: { fields: fields.join(",") },
    });
    return null;
  },
});

/** Elenco paginato. Con `status` filtra tramite indice. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator, status: v.optional(clientStatus) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const status = args.status;
    if (status !== undefined) {
      return await ctx.db
        .query("clients")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .paginate(args.paginationOpts);
    }
    return await ctx.db.query("clients").order("desc").paginate(args.paginationOpts);
  },
});

export const get = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db.get("clients", args.clientId);
  },
});
