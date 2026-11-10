import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { notify } from "./lib/notify";
import { formatDateIt, formatEuroIt } from "./lib/reminders";
import { isReminderWindow, romeDayStart } from "./lib/romeTime";

/**
 * Promemoria di pagamento ai clienti.
 *  - AUTOMATICO: ogni giorno, dalle 10:30 (ora italiana), per le scadenze del GIORNO DOPO. Una sola email per cliente, con tutte le sue scadenze.
 *  - A MANO (un clic): l'amministratore invia a tutti i clienti con scadenze entro N giorni, oppure solo ad alcuni.
 * Scadenze = pagamenti in scadenza (emessi e non pagati) + rinnovi degli abbonamenti attivi (le rate mensili).
 * NB: nelle email non compare mai la parola «fattura»: non tutti gli abbonamenti passano da una fattura.
 * Ogni email contiene l'avviso sui costi aggiuntivi in caso di mancato pagamento (PAYMENT_NOTICE).
 */

const MAX_ROWS = 500;
const MAX_DAYS = 60;

export type DueItem = {
  kind: "invoice" | "subscription";
  id: Id<"invoices"> | Id<"subscriptions">;
  clientId: Id<"clients">;
  label: string;
  dueAt: number;
  amountCents: number;
};

async function collectDue(ctx: QueryCtx | MutationCtx, from: number, to: number, opts: { onlyNotYetReminded: boolean }): Promise<Map<Id<"clients">, DueItem[]>> {
  const out = new Map<Id<"clients">, DueItem[]>();
  const push = (i: DueItem) => out.set(i.clientId, [...(out.get(i.clientId) ?? []), i]);
  const invoices = await ctx.db.query("invoices").withIndex("by_status_and_dueAt", (q) => q.eq("status", "sent").gte("dueAt", from).lt("dueAt", to)).take(MAX_ROWS);
  // Un pagamento collegato a un abbonamento «copre» il rinnovo: niente doppia riga per lo stesso importo.
  const covered = new Set<string>();
  for (const i of invoices) {
    if (!i.visibleToClient) continue;
    if (i.subscriptionId) covered.add(i.subscriptionId);
    if (opts.onlyNotYetReminded && i.eveReminderSentAt !== undefined) continue;
    push({ kind: "invoice", id: i._id, clientId: i.clientId, label: `Pagamento n. ${i.number}`, dueAt: i.dueAt, amountCents: i.amountCents });
  }
  const subs = await ctx.db.query("subscriptions").withIndex("by_status_and_nextRenewalAt", (q) => q.eq("status", "active").gte("nextRenewalAt", from).lt("nextRenewalAt", to)).take(MAX_ROWS);
  for (const s of subs) {
    if (s.nextRenewalAt === undefined) continue;
    if (covered.has(s._id)) continue;
    if (opts.onlyNotYetReminded && s.eveReminderForRenewalAt === s.nextRenewalAt) continue;
    push({ kind: "subscription", id: s._id, clientId: s.clientId, label: `Rinnovo: ${s.name}`, dueAt: s.nextRenewalAt, amountCents: s.amountCents });
  }
  for (const list of out.values()) list.sort((a, b) => a.dueAt - b.dueAt);
  return out;
}

/** Solo per i test. */
export const collectDueForTest = (ctx: QueryCtx, from: number, to: number) => collectDue(ctx, from, to, { onlyNotYetReminded: false });

const lineOf = (i: DueItem) => `• ${i.label} · ${formatEuroIt(i.amountCents)} · scade il ${formatDateIt(i.dueAt)}`;

function composeData(client: Doc<"clients">, items: DueItem[], mode: "eve" | "manual") {
  const days = new Set(items.map((i) => formatDateIt(i.dueAt)));
  return {
    name: client.contactName,
    lines: items.map(lineOf).join("\n"),
    intro: mode === "eve" ? (items.length === 1 ? "Domani scade il pagamento indicato qui sotto." : "Domani scadono i pagamenti indicati qui sotto.") : "Ti ricordiamo le prossime scadenze di pagamento.",
    when: mode === "eve" ? "scadenza domani" : days.size === 1 ? `scadenza il ${[...days][0]}` : "prossime scadenze",
  };
}

async function markEve(ctx: MutationCtx, items: DueItem[], now: number) {
  for (const i of items) {
    if (i.kind === "invoice") await ctx.db.patch("invoices", i.id as Id<"invoices">, { eveReminderSentAt: now });
    else await ctx.db.patch("subscriptions", i.id as Id<"subscriptions">, { eveReminderForRenewalAt: i.dueAt });
  }
}

/** Cron orario (al minuto :30). Spedisce solo dalle 10:30 alle 18:59 ora di Roma, per le scadenze del giorno dopo. */
export const runAuto = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ clients: number; sent: number }> => {
    const now = Date.now();
    if (!isReminderWindow(now)) return { clients: 0, sent: 0 };
    const due = await collectDue(ctx, romeDayStart(now, 1), romeDayStart(now, 2), { onlyNotYetReminded: true });
    let sent = 0;
    for (const [clientId, items] of due) {
      const client = await ctx.db.get("clients", clientId);
      if (!client) continue;
      // Cliente escluso dalle email automatiche: niente invio e niente righe di «saltata» ogni ora.
      if (client.notifyEmail === false) {
        await markEve(ctx, items, now);
        continue;
      }
      const queued = await notify(ctx, "payment_reminder", { clientId, data: composeData(client, items, "eve"), dedupeSubject: clientId });
      if (queued > 0) {
        await markEve(ctx, items, now);
        sent++;
      }
    }
    return { clients: due.size, sent };
  },
});

// ---------------------------------------------------------------- Invio a mano (amministratore)

const daysArg = v.number();
const clampDays = (d: number) => Math.min(MAX_DAYS, Math.max(1, Math.round(d)));

/** Anteprima: chi riceverebbe il promemoria (scadenze da oggi ai prossimi N giorni). `nowMs` arriva dal browser (arrotondato all'ora). */
export const preview = query({
  args: { nowMs: v.number(), days: daysArg },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const from = romeDayStart(args.nowMs, 0);
    const to = romeDayStart(args.nowMs, clampDays(args.days) + 1);
    const due = await collectDue(ctx, from, to, { onlyNotYetReminded: false });
    const setting = await ctx.db.query("notificationSettings").withIndex("by_kind", (q) => q.eq("kind", "payment_reminder")).unique();
    const clients = [];
    for (const [clientId, items] of due) {
      const client = await ctx.db.get("clients", clientId);
      if (!client) continue;
      clients.push({
        clientId,
        name: client.displayName,
        email: client.email,
        notifyEmail: client.notifyEmail !== false,
        items: items.map((i) => ({ key: `${i.kind}:${i.id}`, kind: i.kind, label: i.label, dueAt: i.dueAt, amountCents: i.amountCents })),
        totalCents: items.reduce((s, i) => s + i.amountCents, 0),
      });
    }
    clients.sort((a, b) => a.items[0].dueAt - b.items[0].dueAt || a.name.localeCompare(b.name));
    return { autoEnabled: setting ? setting.enabled : true, clients };
  },
});

/** Un clic: invia il promemoria a tutti i clienti con scadenze entro N giorni (o solo a quelli scelti). */
export const sendNow = mutation({
  args: { days: daysArg, clientIds: v.optional(v.array(v.id("clients"))) },
  handler: async (ctx, args): Promise<{ sent: number; optedOut: number; alreadySent: number }> => {
    const { actorId } = await requireAdmin(ctx);
    const now = Date.now();
    const due = await collectDue(ctx, romeDayStart(now, 0), romeDayStart(now, clampDays(args.days) + 1), { onlyNotYetReminded: false });
    const only = args.clientIds ? new Set<string>(args.clientIds) : null;
    let sent = 0;
    let optedOut = 0;
    let alreadySent = 0;
    for (const [clientId, items] of due) {
      if (only && !only.has(clientId)) continue;
      const client = await ctx.db.get("clients", clientId);
      if (!client) continue;
      if (client.notifyEmail === false) {
        optedOut++;
        continue;
      }
      const queued = await notify(ctx, "payment_reminder", { clientId, data: composeData(client, items, "manual"), dedupeSubject: clientId, ignoreSetting: true });
      if (queued > 0) sent++;
      else alreadySent++; // nessuna riga = bloccata dall'anti-ripetizione (gia' inviato nelle ultime 20 ore)
    }
    await audit(ctx, { actorType: "admin", actorId, action: "payment_reminders.sent_manually", metadata: { sent, optedOut, alreadySent, days: clampDays(args.days), selected: only ? only.size : 0 } });
    return { sent, optedOut, alreadySent };
  },
});
