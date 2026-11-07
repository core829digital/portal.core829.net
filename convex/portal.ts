import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { fail, INVALID_LINK_MESSAGE } from "./lib/errors";
import { requireUnlock, resolveLink } from "./lib/links";

/**
 * Funzioni pubbliche del portale cliente (sola lettura, senza login).
 *
 * REGOLE:
 *  - l'unica chiave d'accesso e' il token del link: il cliente NON puo' scegliere di quale cliente
 *    vedere i dati, il `clientId` si ricava sempre dal link sul server;
 *  - ogni risposta e' costruita campo per campo (DTO): niente documenti interi, niente `internalNotes`,
 *    niente `storageId`, niente ID di altri clienti;
 *  - elenchi sempre limitati (take), mai `collect()`.
 */

const VISIBLE_INVOICE_STATUSES = new Set(["sent", "overdue", "paid"]);
const UPDATES_PER_PROJECT = 5;

export const overview = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const link = await resolveLink(ctx, args.token);
    const client = await ctx.db.get("clients", link.clientId);
    if (!client) return fail("INVALID_LINK", INVALID_LINK_MESSAGE);

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_clientId", (q) => q.eq("clientId", client._id))
      .order("desc")
      .take(50);

    const visibleUpdates = await ctx.db
      .query("projectUpdates")
      .withIndex("by_clientId_and_visibleToClient", (q) => q.eq("clientId", client._id).eq("visibleToClient", true))
      .order("desc")
      .take(200);
    const updatesByProject = new Map<string, { title: string; body: string; at: number }[]>();
    for (const u of visibleUpdates) {
      const list = updatesByProject.get(u.projectId) ?? [];
      if (list.length < UPDATES_PER_PROJECT) list.push({ title: u.title, body: u.body, at: u._creationTime });
      updatesByProject.set(u.projectId, list);
    }

    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_clientId", (q) => q.eq("clientId", client._id))
      .order("desc")
      .take(50);

    const invoices = (
      await ctx.db
        .query("invoices")
        .withIndex("by_clientId", (q) => q.eq("clientId", client._id))
        .order("desc")
        .take(200)
    ).filter((i) => i.visibleToClient && VISIBLE_INVOICE_STATUSES.has(i.status));

    const outstandingCents = invoices
      .filter((i) => i.status === "sent" || i.status === "overdue")
      .reduce((sum, i) => sum + i.amountCents, 0);
    const overdueCents = invoices.filter((i) => i.status === "overdue").reduce((sum, i) => sum + i.amountCents, 0);

    return {
      client: {
        displayName: client.displayName,
        contactName: client.contactName,
        packageType: client.packageType,
        status: client.status,
        welcomeMessage: client.welcomeMessage ?? null,
      },
      projects: projects.map((p) => ({
        id: p._id,
        name: p.name,
        description: p.description ?? null,
        status: p.status,
        progress: p.progress,
        startDate: p.startDate ?? null,
        dueDate: p.dueDate ?? null,
        updates: updatesByProject.get(p._id) ?? [],
      })),
      subscriptions: subscriptions
        .filter((s) => s.status !== "cancelled")
        .map((s) => ({
          id: s._id,
          name: s.name,
          description: s.description ?? null,
          amountCents: s.amountCents,
          currency: s.currency,
          interval: s.interval,
          status: s.status,
          nextRenewalAt: s.nextRenewalAt ?? null,
        })),
      billing: {
        currency: "EUR" as const,
        outstandingCents,
        overdueCents,
        invoices: invoices.map((i) => ({
          id: i._id,
          number: i.number,
          issuedAt: i.issuedAt,
          dueAt: i.dueAt,
          amountCents: i.amountCents,
          status: i.status,
          paidAt: i.paidAt ?? null,
          note: i.note ?? null,
        })),
      },
    };
  },
});

/** Elenco dei documenti: richiede il codice di sblocco. Mostra solo file puliti e visibili al cliente. */
export const documents = query({
  args: { token: v.string(), unlockToken: v.string() },
  handler: async (ctx, args) => {
    const link = await resolveLink(ctx, args.token);
    await requireUnlock(ctx, link, args.unlockToken);

    const docs = await ctx.db
      .query("documents")
      .withIndex("by_clientId", (q) => q.eq("clientId", link.clientId))
      .order("desc")
      .take(200);
    return docs
      .filter((d) => d.visibleToClient && d.scanStatus === "clean")
      .map((d) => ({
        id: d._id,
        title: d.title,
        kind: d.kind,
        fileName: d.fileName,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        createdAt: d._creationTime,
      }));
  },
});

/** Registra l'apertura del link. Al massimo una scrittura al minuto, per non amplificare le richieste. */
export const touch = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const link = await resolveLink(ctx, args.token);
    const now = Date.now();
    if (link.lastUsedAt !== undefined && now - link.lastUsedAt < 60_000) return null;
    await ctx.db.patch("accessLinks", link._id, { lastUsedAt: now, useCount: link.useCount + 1 });
    await audit(ctx, {
      actorType: "client",
      clientId: link.clientId,
      action: "portal.opened",
      resourceType: "accessLink",
      resourceId: link._id,
    });
    return null;
  },
});
