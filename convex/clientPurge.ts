import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { audit } from "./lib/audit";

/** Documenti cancellati per ogni passo: resta ben sotto i limiti di una mutation Convex. */
const BATCH = 200;

/**
 * Eliminazione definitiva di un cliente, a lotti (puo' avere migliaia di righe). Ogni passo cancella fino a BATCH righe
 * e si ripianifica finche' non resta nulla; alla fine rimuove il cliente e scrive l'audit.
 * Ordine: prima i collegamenti d'accesso (il cliente perde subito l'accesso), poi le righe che puntano ad altre,
 * infine documenti (con i loro file) e progetti.
 */
export const step = internalMutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get("clients", args.clientId);
    if (!client || client.deletionStartedAt === undefined) return null;
    const clientId = args.clientId;
    let left = BATCH;
    const budgetEnded = () => left <= 0;
    const dropFile = async (id: Id<"_storage"> | undefined) => {
      if (!id) return;
      try {
        await ctx.storage.delete(id);
      } catch {
        // file gia' assente: niente da fare
      }
    };

    // 1. Accesso: link, codici, sessioni di sblocco.
    const links = await ctx.db.query("accessLinks").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(left);
    for (const link of links) {
      for (const row of await ctx.db.query("otpCodes").withIndex("by_linkId", (q) => q.eq("linkId", link._id)).take(100)) {
        await ctx.db.delete("otpCodes", row._id);
      }
      for (const row of await ctx.db.query("unlockSessions").withIndex("by_linkId", (q) => q.eq("linkId", link._id)).take(100)) {
        await ctx.db.delete("unlockSessions", row._id);
      }
      await ctx.db.delete("accessLinks", link._id);
    }
    left -= links.length;

    // 2. Ticket e messaggi.
    if (!budgetEnded()) {
      const tickets = await ctx.db.query("tickets").withIndex("by_clientId_and_lastMessageAt", (q) => q.eq("clientId", clientId)).take(Math.max(1, Math.floor(left / 4)));
      for (const ticket of tickets) {
        for (const m of await ctx.db.query("ticketMessages").withIndex("by_ticketId_and_createdAt", (q) => q.eq("ticketId", ticket._id)).take(100)) {
          await ctx.db.delete("ticketMessages", m._id);
          left--;
        }
        const rest = await ctx.db.query("ticketMessages").withIndex("by_ticketId_and_createdAt", (q) => q.eq("ticketId", ticket._id)).first();
        if (!rest) await ctx.db.delete("tickets", ticket._id);
        left--;
      }
    }

    // 3. Firme, approvazioni, scadenze, abbonamenti, fatture.
    const simple = async (
      rows: Array<{ _id: Id<"signatureRequests"> | Id<"approvalRequests"> | Id<"deadlines"> | Id<"subscriptions"> | Id<"invoices"> | Id<"clientReports"> | Id<"clientPages"> }>,
      table: "signatureRequests" | "approvalRequests" | "deadlines" | "subscriptions" | "invoices" | "clientReports" | "clientPages",
    ) => {
      for (const row of rows) await ctx.db.delete(table, row._id as never);
      left -= rows.length;
    };
    if (!budgetEnded()) await simple(await ctx.db.query("signatureRequests").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(left), "signatureRequests");
    if (!budgetEnded()) await simple(await ctx.db.query("approvalRequests").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(left), "approvalRequests");
    if (!budgetEnded()) await simple(await ctx.db.query("deadlines").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(left), "deadlines");
    if (!budgetEnded()) await simple(await ctx.db.query("subscriptions").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(left), "subscriptions");
    if (!budgetEnded()) await simple(await ctx.db.query("invoices").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(left), "invoices");
    if (!budgetEnded()) await simple(await ctx.db.query("clientReports").withIndex("by_clientId_and_month", (q) => q.eq("clientId", clientId)).take(left), "clientReports");
    if (!budgetEnded()) await simple(await ctx.db.query("clientPages").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(left), "clientPages");

    // 4. Bozze documento (con i file).
    if (!budgetEnded()) {
      const drafts = await ctx.db.query("docDrafts").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(left);
      for (const d of drafts) {
        await dropFile(d.storageId);
        await dropFile(d.originalStorageId);
        await dropFile(d.previewStorageId);
        await ctx.db.delete("docDrafts", d._id);
      }
      left -= drafts.length;
    }

    // 5. Registro email del cliente (con gli allegati). Il registro di audit resta, come prova.
    if (!budgetEnded()) {
      const notes = await ctx.db.query("notifications").withIndex("by_clientId_and_createdAt", (q) => q.eq("clientId", clientId)).take(left);
      for (const n of notes) {
        await dropFile(n.attachmentStorageId);
        await ctx.db.delete("notifications", n._id);
      }
      left -= notes.length;
    }

    // 6. Documenti (con i file), poi aggiornamenti e progetti.
    if (!budgetEnded()) {
      const docs = await ctx.db.query("documents").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(left);
      for (const d of docs) {
        await dropFile(d.storageId);
        await ctx.db.delete("documents", d._id);
      }
      left -= docs.length;
    }
    if (!budgetEnded()) {
      const updates = await ctx.db.query("projectUpdates").withIndex("by_clientId_and_visibleToClient", (q) => q.eq("clientId", clientId)).take(left);
      for (const u of updates) await ctx.db.delete("projectUpdates", u._id);
      left -= updates.length;
    }
    if (!budgetEnded()) {
      const projects = await ctx.db.query("projects").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(left);
      for (const p of projects) await ctx.db.delete("projects", p._id);
      left -= projects.length;
    }

    // 7. Richieste del sito nate da questo cliente: restano, ma senza il collegamento.
    if (!budgetEnded()) {
      const msgs = await ctx.db.query("siteMessages").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(left);
      for (const m of msgs) await ctx.db.patch("siteMessages", m._id, { clientId: undefined });
      left -= msgs.length;
    }

    if (budgetEnded()) {
      await ctx.scheduler.runAfter(0, internal.clientPurge.step, { clientId });
      return null;
    }
    // Controllo finale: se e' rimasto qualcosa (es. righe create nel frattempo), un altro giro.
    const remaining =
      (await ctx.db.query("documents").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).first()) ||
      (await ctx.db.query("projects").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).first()) ||
      (await ctx.db.query("invoices").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).first()) ||
      (await ctx.db.query("projectUpdates").withIndex("by_clientId_and_visibleToClient", (q) => q.eq("clientId", clientId)).first()) ||
      (await ctx.db.query("tickets").withIndex("by_clientId_and_lastMessageAt", (q) => q.eq("clientId", clientId)).first());
    if (remaining) {
      await ctx.scheduler.runAfter(0, internal.clientPurge.step, { clientId });
      return null;
    }
    await ctx.db.delete("clients", clientId);
    await audit(ctx, {
      actorType: "system",
      action: "client.deleted",
      resourceType: "client",
      resourceId: clientId,
      metadata: { displayName: client.displayName },
    });
    return null;
  },
});
