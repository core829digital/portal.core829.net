import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, env, type ActionCtx } from "./_generated/server";
import { isSiteSettingKey, openBridge, type Bridge } from "./lib/siteBridge";
import { invalid } from "./lib/text";

/**
 * Backoffice di Andromedia Web dentro il portale admin: ogni funzione e' riservata all'amministratore del portale
 * (controllo fatto per primo, sul server) e poi parla con il database del sito tramite il ponte firmato (lib/siteBridge.ts).
 */

export type SitePost = { _id: string; title: string; slug: string; excerpt: string; content: string; coverUrl?: string; tags?: string[]; status: "draft" | "published"; createdAt: number; updatedAt: number };
export type SiteWork = { _id: string; title: string; client: string; url: string; category: string; description: string; imageUrl?: string; featured: boolean; createdAt: number };
export type SiteMessage = { _id: string; name: string; email: string; message: string; source: string; createdAt: number };
export type SiteAudit = { _id: string; actor: string; action: string; target: string; detail?: string; ts: number };

async function gate(ctx: ActionCtx): Promise<{ actorId: string; bridge: Bridge }> {
  const { actorId } = await ctx.runQuery(internal.docStudio.assertAdmin, {});
  return { actorId, bridge: await openBridge(env) };
}

const logWrite = (ctx: ActionCtx, actorId: string, action: string, target: string) => ctx.runMutation(internal.site.log, { actorId, action, target });
const postStatus = v.union(v.literal("draft"), v.literal("published"));

/** Stato del collegamento e conteggi: serve alla pagina iniziale per dire se tutto e' collegato. */
export const dashboard = action({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { bridge } = await gate(ctx);
    const days = Math.min(Math.max(1, Math.round(args.days ?? 30)), 90);
    const [summary, series, topPaths, topLabels, posts, works, messages] = await Promise.all([
      bridge.query<{ viewsToday: number; clicksToday: number; views7: number; clicks7: number; views30: number; clicks30: number; ctr30: number; total: number }>("events:summary"),
      bridge.query<{ day: string; views: number; clicks: number }[]>("events:timeseries", { days }),
      bridge.query<{ path: string; count: number }[]>("events:topPaths", { days, limit: 8 }),
      bridge.query<{ label: string; count: number }[]>("events:topLabels", { days, limit: 8 }),
      bridge.query<SitePost[]>("posts:list"),
      bridge.query<SiteWork[]>("portfolio:list"),
      bridge.query<SiteMessage[]>("messages:list"),
    ]);
    return {
      summary,
      series,
      topPaths,
      topLabels,
      counts: { posts: posts.length, published: posts.filter((p) => p.status === "published").length, works: works.length, messages: messages.length, lastMessageAt: messages[0]?.createdAt ?? null },
    };
  },
});

export const postsList = action({
  args: {},
  handler: async (ctx): Promise<SitePost[]> => (await gate(ctx)).bridge.query<SitePost[]>("posts:list"),
});

export const postSave = action({
  args: {
    id: v.union(v.string(), v.null()),
    title: v.string(),
    slug: v.string(),
    excerpt: v.string(),
    content: v.string(),
    tags: v.array(v.string()),
    status: postStatus,
    coverStorageId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<null> => {
    const { actorId, bridge } = await gate(ctx);
    if (args.title.trim() === "" || args.title.length > 140) return invalid("titolo", "Il titolo è obbligatorio (massimo 140 caratteri).");
    if (args.content.length > 40_000) return invalid("testo", "Il testo supera 40.000 caratteri.");
    const { id, ...rest } = args;
    const payload = { ...rest, tags: rest.tags.slice(0, 10) };
    if (id) await bridge.mutate("posts:update", { id, ...payload });
    else await bridge.mutate("posts:create", payload);
    await logWrite(ctx, actorId, id ? "post_updated" : "post_created", args.slug);
    return null;
  },
});

export const postSetStatus = action({
  args: { id: v.string(), status: postStatus },
  handler: async (ctx, args): Promise<null> => {
    const { actorId, bridge } = await gate(ctx);
    await bridge.mutate("posts:setStatus", args);
    await logWrite(ctx, actorId, "post_status", `${args.id}:${args.status}`);
    return null;
  },
});

export const postRemove = action({
  args: { id: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const { actorId, bridge } = await gate(ctx);
    await bridge.mutate("posts:remove", args);
    await logWrite(ctx, actorId, "post_removed", args.id);
    return null;
  },
});

export const worksList = action({
  args: {},
  handler: async (ctx): Promise<SiteWork[]> => (await gate(ctx)).bridge.query<SiteWork[]>("portfolio:list"),
});

export const workCreate = action({
  args: { title: v.string(), client: v.string(), url: v.string(), category: v.string(), description: v.string(), featured: v.boolean(), imageStorageId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<null> => {
    const { actorId, bridge } = await gate(ctx);
    if (args.title.trim() === "" || args.client.trim() === "") return invalid("lavoro", "Titolo e cliente sono obbligatori.");
    if (args.url !== "" && !/^https?:\/\/[^\s]{1,500}$/.test(args.url)) return invalid("indirizzo", "L'indirizzo del progetto deve iniziare con http:// o https://.");
    await bridge.mutate("portfolio:create", args);
    await logWrite(ctx, actorId, "work_created", args.title);
    return null;
  },
});

export const workRemove = action({
  args: { id: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const { actorId, bridge } = await gate(ctx);
    await bridge.mutate("portfolio:remove", args);
    await logWrite(ctx, actorId, "work_removed", args.id);
    return null;
  },
});

export const messagesList = action({
  args: {},
  handler: async (ctx): Promise<SiteMessage[]> => (await gate(ctx)).bridge.query<SiteMessage[]>("messages:list"),
});

export const messageRemove = action({
  args: { id: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const { actorId, bridge } = await gate(ctx);
    await bridge.mutate("messages:remove", args);
    await logWrite(ctx, actorId, "message_removed", args.id);
    return null;
  },
});

/** Impostazioni e contenuti del sito (hero, FAQ, SEO...). Solo le chiavi ammesse. */
export const settingsAll = action({
  args: {},
  handler: async (ctx): Promise<Record<string, unknown>> => (await gate(ctx)).bridge.query<Record<string, unknown>>("settings:listAll"),
});

export const settingSet = action({
  args: { key: v.string(), value: v.any() },
  handler: async (ctx, args): Promise<null> => {
    const { actorId, bridge } = await gate(ctx);
    if (!isSiteSettingKey(args.key)) return invalid("chiave", "Impostazione non ammessa.");
    if (JSON.stringify(args.value ?? null).length > 60_000) return invalid("valore", "Il contenuto supera 60 KB.");
    await bridge.mutate("settings:set", { key: args.key, value: args.value, actor: `portale:${actorId}` });
    await logWrite(ctx, actorId, "setting_set", args.key);
    return null;
  },
});

export const auditList = action({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<SiteAudit[]> => (await gate(ctx)).bridge.query<SiteAudit[]>("audit:list", { limit: Math.min(Math.max(1, args.limit ?? 50), 200) }),
});

/** Indirizzo temporaneo per caricare una copertina o un'immagine direttamente nell'archivio del sito. */
export const uploadUrl = action({
  args: { kind: v.union(v.literal("posts"), v.literal("portfolio")) },
  handler: async (ctx, args): Promise<string> => {
    const { bridge } = await gate(ctx);
    const url = await bridge.mutate<string>(`${args.kind}:generateUploadUrl`);
    if (typeof url !== "string" || !/^https:\/\/[a-z0-9.-]+\.convex\.cloud\//.test(url)) return invalid("caricamento", "Indirizzo di caricamento non valido.");
    return url;
  },
});

export const eventsPurge = action({
  args: {},
  handler: async (ctx): Promise<{ removed: number }> => {
    const { actorId, bridge } = await gate(ctx);
    const r = await bridge.mutate<{ removed: number }>("events:purge", { actor: `portale:${actorId}` });
    await logWrite(ctx, actorId, "events_purged", String(r.removed));
    return r;
  },
});
