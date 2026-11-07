import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";
import { buildOverview, loadWidgets } from "./lib/overview";
import { normalizeWidgets, type Widget } from "./lib/widgets";
import { widgetValidator } from "./lib/validators";

/** Pagina del cliente: lettura per l'editor dell'amministratore. */
export const get = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await loadWidgets(ctx, args.clientId);
  },
});

/** Salva la pagina personalizzata. Il contenuto viene validato e ripulito sul server. */
export const save = mutation({
  args: { clientId: v.id("clients"), widgets: v.array(widgetValidator) },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const client = await ctx.db.get("clients", args.clientId);
    if (!client) return fail("NOT_FOUND", "Cliente non trovato.");

    const widgets = normalizeWidgets(args.widgets as Widget[]);
    const existing = await ctx.db
      .query("clientPages")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (existing) await ctx.db.replace("clientPages", existing._id, { clientId: args.clientId, widgets });
    else await ctx.db.insert("clientPages", { clientId: args.clientId, widgets });

    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: args.clientId,
      action: "page.saved",
      resourceType: "clientPage",
      metadata: { widgets: widgets.length, active: widgets.filter((w) => w.enabled).length },
    });
    return widgets;
  },
});

/** Torna alla pagina predefinita. */
export const reset = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const { actorId } = await requireAdmin(ctx);
    const existing = await ctx.db
      .query("clientPages")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (!existing) return null;
    await ctx.db.delete("clientPages", existing._id);
    await audit(ctx, {
      actorType: "admin",
      actorId,
      clientId: args.clientId,
      action: "page.reset",
      resourceType: "clientPage",
    });
    return null;
  },
});

/**
 * Anteprima: esattamente cio' che vedrebbe il cliente. Con `widgets` mostra anche le modifiche non
 * ancora salvate (validate come al salvataggio).
 */
export const preview = query({
  args: { clientId: v.id("clients"), widgets: v.optional(v.array(widgetValidator)) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const data = await buildOverview(ctx, args.clientId);
    if (!data) return null;
    const widgets = args.widgets ? normalizeWidgets(args.widgets as Widget[]) : (await loadWidgets(ctx, args.clientId)).widgets;
    return { ...data, widgets: widgets.filter((w) => w.enabled) };
  },
});
