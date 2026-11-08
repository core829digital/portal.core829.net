import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { notify } from "./lib/notify";
import { fail } from "./lib/errors";
import { assertIntInRange, assertTimestamp, cleanText } from "./lib/text";
import { projectStatus } from "./lib/validators";

const nullableString = v.optional(v.union(v.string(), v.null()));
const nullableNumber = v.optional(v.union(v.number(), v.null()));

export const create = mutation({
  args: {
    clientId: v.id("clients"),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.optional(projectStatus),
    progress: v.optional(v.number()),
    startDate: v.optional(v.number()),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const client = await ctx.db.get("clients", args.clientId);
    if (!client) return fail("NOT_FOUND", "Cliente non trovato.");

    const status = args.status ?? "planned";
    // Un progetto completato e' sempre al 100%.
    const progress = status === "completed" ? 100 : assertIntInRange(args.progress ?? 0, 0, 100, "avanzamento");

    const projectId = await ctx.db.insert("projects", {
      clientId: args.clientId,
      name: cleanText(args.name, { field: "nome progetto", min: 1, max: 120 }),
      description:
        args.description === undefined
          ? undefined
          : cleanText(args.description, { field: "descrizione", max: 2000, multiline: true }),
      status,
      progress,
      startDate: args.startDate === undefined ? undefined : assertTimestamp(args.startDate, "data di inizio"),
      dueDate: args.dueDate === undefined ? undefined : assertTimestamp(args.dueDate, "data di consegna"),
    });
    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: args.clientId,
      action: "project.created",
      resourceType: "project",
      resourceId: projectId,
    });
    return projectId;
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: nullableString,
    status: v.optional(projectStatus),
    progress: v.optional(v.number()),
    startDate: nullableNumber,
    dueDate: nullableNumber,
  },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) return fail("NOT_FOUND", "Progetto non trovato.");

    const patch: Partial<Omit<Doc<"projects">, "_id" | "_creationTime" | "clientId">> = {};
    if (args.name !== undefined) patch.name = cleanText(args.name, { field: "nome progetto", min: 1, max: 120 });
    if (args.description !== undefined) {
      patch.description =
        args.description === null ? undefined : cleanText(args.description, { field: "descrizione", max: 2000, multiline: true });
    }
    if (args.progress !== undefined) patch.progress = assertIntInRange(args.progress, 0, 100, "avanzamento");
    if (args.status !== undefined) {
      patch.status = args.status;
      if (args.status === "completed") patch.progress = 100;
    }
    if (args.startDate !== undefined) {
      patch.startDate = args.startDate === null ? undefined : assertTimestamp(args.startDate, "data di inizio");
    }
    if (args.dueDate !== undefined) {
      patch.dueDate = args.dueDate === null ? undefined : assertTimestamp(args.dueDate, "data di consegna");
    }

    const fields = Object.keys(patch);
    if (fields.length === 0) return null;
    await ctx.db.patch("projects", args.projectId, patch);
    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: project.clientId,
      action: "project.updated",
      resourceType: "project",
      resourceId: args.projectId,
      metadata: { fields: fields.join(",") },
    });
    return null;
  },
});

/**
 * Aggiunge un aggiornamento alla cronologia. Il `clientId` viene SEMPRE ricavato dal progetto,
 * mai da un argomento: non si puo' attribuire un aggiornamento a un cliente sbagliato.
 */
export const addUpdate = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    body: v.string(),
    visibleToClient: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) return fail("NOT_FOUND", "Progetto non trovato.");
    const updateId = await ctx.db.insert("projectUpdates", {
      projectId: args.projectId,
      clientId: project.clientId,
      title: cleanText(args.title, { field: "titolo", min: 1, max: 120 }),
      body: cleanText(args.body, { field: "testo", min: 1, max: 2000, multiline: true }),
      visibleToClient: args.visibleToClient,
    });
    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: project.clientId,
      action: "project.update_added",
      resourceType: "projectUpdate",
      resourceId: updateId,
      metadata: { visibleToClient: args.visibleToClient },
    });
    if (args.visibleToClient) {
      await notify(ctx, "project_update", { clientId: project.clientId, data: { project: project.name, title: cleanText(args.title, { field: "titolo", min: 1, max: 120 }), text: cleanText(args.body, { field: "testo", min: 1, max: 2000, multiline: true }) } });
    }
    return updateId;
  },
});

export const listByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("projects")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(100);
  },
});

export const updatesByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("projectUpdates")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(100);
  },
});
