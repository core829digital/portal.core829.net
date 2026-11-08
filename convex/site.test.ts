/// <reference types="vite/client" />
import { createHash } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const asUser = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId}|s1`, issuer: "https://test.local", tokenIdentifier: `https://test.local|${userId}|s1` });
const SECRET = "segreto-condiviso-di-prova";
const DIGEST = createHash("sha256").update(SECRET).digest("hex");

type Call = { url: string; path: string; args: Record<string, unknown> };

/** Finto server di Andromedia Web: risponde come l'API HTTP di Convex e registra le chiamate. */
function fakeSite(handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as { path: string; args: Record<string, unknown>[] };
      const args = body.args?.[0] ?? {};
      calls.push({ url, path: body.path, args });
      const h = handlers[body.path];
      if (!h) return new Response(JSON.stringify({ status: "error", errorMessage: `Could not find public function for '${body.path}'` }), { status: 200 });
      try {
        return new Response(JSON.stringify({ status: "success", value: h(args) }), { status: 200 });
      } catch (e) {
        return new Response(JSON.stringify({ status: "error", errorMessage: `Uncaught Error: ${(e as Error).message}` }), { status: 200 });
      }
    }),
  );
  return calls;
}

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: "stefan@core829.net", addedAt: Date.now() }));
  const mk = (email: string) => t.run((ctx) => ctx.db.insert("users", { email, emailVerificationTime: Date.now() }));
  return { t, admin: asUser(t, await mk("stefan@core829.net")), stranger: asUser(t, await mk("altro@esempio.it")) };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { data?: { code?: string; message?: string } }).data?.code ?? `ERR:${String(e).slice(0, 100)}`;
  }
};

beforeEach(() => {
  process.env.AW_CONVEX_URL = "https://andromedia-test-123.convex.cloud";
  process.env.AW_CONVEX_GUARD = SECRET;
});
afterEach(() => vi.unstubAllGlobals());

describe("ponte con il backoffice di Andromedia Web", () => {
  it("solo l'amministratore: anonimi ed estranei non fanno nessuna chiamata verso il sito", async () => {
    const h = await setup();
    const calls = fakeSite({});
    const run = (c: { action: typeof h.admin.action }) => [
      c.action(api.siteActions.postsList, {}),
      c.action(api.siteActions.messagesList, {}),
      c.action(api.siteActions.postRemove, { id: "x" }),
      c.action(api.siteActions.settingSet, { key: "global", value: {} }),
      c.action(api.siteActions.uploadUrl, { kind: "posts" }),
      c.action(api.siteActions.dashboard, {}),
    ];
    for (const p of run(h.t as never)) expect(await code(p)).toBe("UNAUTHENTICATED");
    for (const p of run(h.stranger as never)) expect(await code(p)).toBe("FORBIDDEN");
    expect(calls).toHaveLength(0);
  });

  it("le scritture portano la guardia (SHA-256 del segreto), le letture no; il segreto non viaggia mai", async () => {
    const h = await setup();
    const calls = fakeSite({
      "posts:list": () => [{ _id: "p1", title: "Ciao", slug: "ciao", excerpt: "", content: "", status: "draft", createdAt: 1, updatedAt: 1 }],
      "posts:create": () => "p2",
    });
    expect(await h.admin.action(api.siteActions.postsList, {})).toHaveLength(1);
    await h.admin.action(api.siteActions.postSave, { id: null, title: "Nuovo", slug: "nuovo", excerpt: "e", content: "c", tags: ["a"], status: "draft" });
    const read = calls.find((c) => c.path === "posts:list")!;
    const write = calls.find((c) => c.path === "posts:create")!;
    expect(read.args.guard).toBeUndefined();
    expect(write.args.guard).toBe(DIGEST);
    expect(JSON.stringify(calls)).not.toContain(SECRET);
    expect(write.url.startsWith("https://andromedia-test-123.convex.cloud")).toBe(true);
    // Tracciato nel registro del portale.
    const log = await h.t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(log.find((l) => l.action === "site.post_created")?.metadata).toMatchObject({ target: "nuovo" });
  });

  it("aggiorna, cambia stato ed elimina con gli identificativi giusti", async () => {
    const h = await setup();
    const calls = fakeSite({ "posts:update": () => null, "posts:setStatus": () => null, "posts:remove": () => null });
    await h.admin.action(api.siteActions.postSave, { id: "abc", title: "T", slug: "t", excerpt: "", content: "", tags: [], status: "published" });
    await h.admin.action(api.siteActions.postSetStatus, { id: "abc", status: "draft" });
    await h.admin.action(api.siteActions.postRemove, { id: "abc" });
    expect(calls.map((c) => c.path)).toEqual(["posts:update", "posts:setStatus", "posts:remove"]);
    expect(calls[0].args).toMatchObject({ id: "abc", status: "published" });
  });

  it("non parte nessuna chiamata se i dati sono sbagliati (titolo vuoto, URL non http, chiave non ammessa)", async () => {
    const h = await setup();
    const calls = fakeSite({});
    expect(await code(h.admin.action(api.siteActions.postSave, { id: null, title: "  ", slug: "x", excerpt: "", content: "", tags: [], status: "draft" }))).not.toBe("OK");
    // eslint-disable-next-line no-script-url -- prova: un indirizzo javascript: deve essere rifiutato
    expect(await code(h.admin.action(api.siteActions.workCreate, { title: "A", client: "B", url: "javascript:alert(1)", category: "SEO", description: "", featured: false }))).not.toBe("OK");
    expect(await code(h.admin.action(api.siteActions.workCreate, { title: "", client: "B", url: "", category: "SEO", description: "", featured: false }))).not.toBe("OK");
    expect(await code(h.admin.action(api.siteActions.settingSet, { key: "admin:password", value: {} }))).not.toBe("OK");
    expect(await code(h.admin.action(api.siteActions.settingSet, { key: "global", value: { big: "x".repeat(70_000) } }))).not.toBe("OK");
    expect(calls.filter((c) => c.path !== "")).toHaveLength(0);
  });

  it("rifiuta indirizzi non Convex o non https e segnala configurazione mancante", async () => {
    const h = await setup();
    const calls = fakeSite({ "posts:list": () => [] });
    for (const bad of ["http://andromedia-test-123.convex.cloud", "https://evil.example.com", "https://x.convex.cloud.evil.com", "non-un-url"]) {
      process.env.AW_CONVEX_URL = bad;
      expect(await code(h.admin.action(api.siteActions.postsList, {}))).not.toBe("OK");
    }
    delete process.env.AW_CONVEX_URL;
    expect(await code(h.admin.action(api.siteActions.postsList, {}))).not.toBe("OK");
    process.env.AW_CONVEX_URL = "https://andromedia-test-123.convex.cloud";
    delete process.env.AW_CONVEX_GUARD;
    expect(await code(h.admin.action(api.siteActions.postRemove, { id: "x" }))).not.toBe("OK");
    expect(calls).toHaveLength(0);
  });

  it("traduce gli errori del sito in messaggi chiari e non scrive nel registro se la scrittura fallisce", async () => {
    const h = await setup();
    fakeSite({
      "posts:create": () => {
        throw new Error("Operazione non autorizzata: firma di sicurezza mancante o non valida.");
      },
      "posts:remove": () => {
        throw new Error("Slug già esistente");
      },
    });
    const err = async (p: Promise<unknown>) => {
      try {
        await p;
        return "OK";
      } catch (e) {
        return (e as { data?: { message?: string } }).data?.message ?? String(e);
      }
    };
    expect(await err(h.admin.action(api.siteActions.postSave, { id: null, title: "T", slug: "t", excerpt: "", content: "", tags: [], status: "draft" }))).toMatch(/AW_CONVEX_GUARD/);
    expect(await err(h.admin.action(api.siteActions.postRemove, { id: "x" }))).toBe("Slug già esistente");
    expect((await h.t.run((ctx) => ctx.db.query("auditLogs").collect())).some((l) => l.action.startsWith("site."))).toBe(false);
  });

  it("impostazioni: solo chiavi ammesse, scritte con l'attore del portale; lettura, messaggi e statistiche", async () => {
    const h = await setup();
    const calls = fakeSite({
      "settings:listAll": () => ({ global: { name: "Andromedia" } }),
      "settings:set": () => ({ ok: true }),
      "messages:list": () => [{ _id: "m1", name: "A", email: "a@b.it", message: "ciao", source: "web", createdAt: 5 }],
      "events:summary": () => ({ viewsToday: 1, clicksToday: 0, views7: 5, clicks7: 1, views30: 20, clicks30: 3, ctr30: 15, total: 99 }),
      "events:timeseries": () => [{ day: "2026-11-01", views: 3, clicks: 1 }],
      "events:topPaths": () => [{ path: "/", count: 9 }],
      "events:topLabels": () => [{ label: "cta", count: 2 }],
      "posts:list": () => [{ _id: "p", status: "published" }, { _id: "q", status: "draft" }],
      "portfolio:list": () => [{ _id: "w" }],
    });
    expect(await h.admin.action(api.siteActions.settingsAll, {})).toEqual({ global: { name: "Andromedia" } });
    await h.admin.action(api.siteActions.settingSet, { key: "seo:home", value: { title: "Home" } });
    const set = calls.find((c) => c.path === "settings:set")!;
    expect(set.args).toMatchObject({ key: "seo:home", guard: DIGEST });
    expect(String(set.args.actor)).toMatch(/^portale:/);
    const dash = await h.admin.action(api.siteActions.dashboard, { days: 500 });
    expect(dash.counts).toEqual({ posts: 2, published: 1, works: 1, messages: 1, lastMessageAt: 5 });
    expect(calls.find((c) => c.path === "events:timeseries")!.args.days).toBe(90); // limitato
    expect(dash.summary.total).toBe(99);
  });

  it("l'indirizzo di caricamento deve essere dell'archivio Convex", async () => {
    const h = await setup();
    fakeSite({ "posts:generateUploadUrl": () => "https://andromedia-test-123.convex.cloud/api/storage/upload?token=abc", "portfolio:generateUploadUrl": () => "https://evil.example.com/x" });
    expect(await h.admin.action(api.siteActions.uploadUrl, { kind: "posts" })).toMatch(/^https:\/\/andromedia-test-123\.convex\.cloud\//);
    expect(await code(h.admin.action(api.siteActions.uploadUrl, { kind: "portfolio" }))).not.toBe("OK");
  });
});
