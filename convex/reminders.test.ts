/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const d = (y: number, m: number, day: number, h = 0) => Date.UTC(y, m - 1, day, h);

type Mail = { to: string[]; subject: string; text: string; html: string };

function setupMail(failFor?: string) {
  process.env.RESEND_API_KEY = "re_chiave_di_prova";
  process.env.AUTH_EMAIL_FROM = "CORE829 <portal@core829.net>";
  process.env.ADMIN_EMAILS = "stefan@core829.net";
  const sent: Mail[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const mail = JSON.parse(init.body as string) as Mail;
      if (failFor && mail.to.includes(failFor)) return new Response("{}", { status: 500 });
      sent.push(mail);
      return new Response("{}", { status: 200 });
    }),
  );
  return sent;
}

async function flush(t: ReturnType<typeof convexTest>) {
  await new Promise((r) => setTimeout(r, 20));
  await t.finishInProgressScheduledFunctions();
}

async function makeClient(t: ReturnType<typeof convexTest>, email = "dimitri@esempio.it", status: "active" | "closed" = "active") {
  return t.run((ctx) =>
    ctx.db.insert("clients", {
      displayName: "DBYoung (Dimitri)",
      contactName: "Dimitri",
      email,
      packageType: "custom",
      status,
    }),
  );
}

async function makeSub(t: ReturnType<typeof convexTest>, clientId: Id<"clients">, extra: Record<string, unknown> = {}) {
  return t.run((ctx) =>
    ctx.db.insert("subscriptions", {
      clientId,
      name: "Pagamento mensile dbyoung.it",
      amountCents: 10700,
      currency: "EUR",
      interval: "month",
      status: "active",
      startedAt: d(2026, 11, 11),
      nextRenewalAt: d(2026, 11, 11),
      reminderDaysBefore: 3,
      ...extra,
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.AUTH_EMAIL_FROM;
  delete process.env.ADMIN_EMAILS;
});

describe("promemoria di rinnovo", () => {
  it("prima dei 3 giorni non invia nulla", async () => {
    vi.setSystemTime(d(2026, 11, 7, 10));
    const sent = setupMail();
    const t = convexTest(schema, modules);
    await makeSub(t, await makeClient(t));
    expect(await t.mutation(internal.reminders.run, {})).toEqual({ advanced: 0, scheduled: 0 });
    await flush(t);
    expect(sent).toHaveLength(0);
  });

  it("l'8 invia il promemoria al cliente e poi la conferma all'admin, una sola volta", async () => {
    vi.setSystemTime(d(2026, 11, 8, 6));
    const sent = setupMail();
    const t = convexTest(schema, modules);
    await makeSub(t, await makeClient(t));
    expect(await t.mutation(internal.reminders.run, {})).toEqual({ advanced: 0, scheduled: 1 });
    await flush(t);

    expect(sent).toHaveLength(2);
    expect(sent[0].to).toEqual(["dimitri@esempio.it"]);
    expect(sent[0].subject).toContain("107,00 €");
    expect(sent[0].subject).toContain("11/11/2026");
    expect(sent[1].to).toEqual(["stefan@core829.net"]);
    expect(sent[1].text).toContain("dimitri@esempio.it");

    // Un secondo giro (anche piu' tardi, il giorno dopo) non rimanda nulla.
    expect(await t.mutation(internal.reminders.run, {})).toEqual({ advanced: 0, scheduled: 0 });
    vi.setSystemTime(d(2026, 11, 9, 6));
    await t.mutation(internal.reminders.run, {});
    await flush(t);
    expect(sent).toHaveLength(2);

    const log = await t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(log.some((l) => l.action === "subscription.reminder_sent" && l.metadata?.adminNotified === true)).toBe(true);
  });

  it("due invii contemporanei non spediscono due volte (prenotazione)", async () => {
    vi.setSystemTime(d(2026, 11, 8, 6));
    const sent = setupMail();
    const t = convexTest(schema, modules);
    const subscriptionId = await makeSub(t, await makeClient(t));
    await Promise.all([
      t.action(internal.reminders.send, { subscriptionId }),
      t.action(internal.reminders.send, { subscriptionId }),
    ]);
    expect(sent.filter((m) => m.to[0] === "dimitri@esempio.it")).toHaveLength(1);
  });

  it("se l'invio al cliente fallisce non segna nulla e riprova, senza avvisare l'admin", async () => {
    vi.setSystemTime(d(2026, 11, 8, 6));
    const sent = setupMail("dimitri@esempio.it");
    const t = convexTest(schema, modules);
    const clientId = await makeClient(t);
    const subscriptionId = await makeSub(t, clientId);
    await t.action(internal.reminders.send, { subscriptionId });
    expect(sent).toHaveLength(0);
    const sub = await t.run((ctx) => ctx.db.get("subscriptions", subscriptionId));
    expect(sub?.lastReminderForRenewalAt).toBeUndefined();

    // Il problema rientra: il giro successivo spedisce.
    const sent2 = setupMail();
    await t.mutation(internal.reminders.run, {});
    await flush(t);
    expect(sent2).toHaveLength(2);
  });

  it("clienti chiusi, abbonamenti annullati o senza anticipo non ricevono nulla", async () => {
    vi.setSystemTime(d(2026, 11, 8, 6));
    const sent = setupMail();
    const t = convexTest(schema, modules);
    const closed = await makeClient(t, "chiuso@esempio.it", "closed");
    await makeSub(t, closed);
    const open = await makeClient(t, "aperto@esempio.it");
    await makeSub(t, open, { status: "cancelled" });
    await makeSub(t, open, { name: "Senza promemoria", reminderDaysBefore: undefined });
    await t.mutation(internal.reminders.run, {});
    await flush(t);
    expect(sent).toHaveLength(0);
  });

  it("dopo la scadenza il rinnovo passa al mese successivo e il ciclo riparte", async () => {
    vi.setSystemTime(d(2026, 11, 12, 6));
    const sent = setupMail();
    const t = convexTest(schema, modules);
    const subscriptionId = await makeSub(t, await makeClient(t), { lastReminderForRenewalAt: d(2026, 11, 11) });
    expect(await t.mutation(internal.reminders.run, {})).toMatchObject({ advanced: 1 });
    const sub = await t.run((ctx) => ctx.db.get("subscriptions", subscriptionId));
    expect(sub?.nextRenewalAt).toBe(d(2026, 12, 11));

    vi.setSystemTime(d(2026, 12, 8, 6));
    await t.mutation(internal.reminders.run, {});
    await flush(t);
    expect(sent[0].subject).toContain("11/12/2026");
  });

  it("senza chiave Resend non invia e non segna il rinnovo come notificato", async () => {
    vi.setSystemTime(d(2026, 11, 8, 6));
    const sent = setupMail();
    delete process.env.RESEND_API_KEY;
    const t = convexTest(schema, modules);
    const subscriptionId = await makeSub(t, await makeClient(t));
    await t.action(internal.reminders.send, { subscriptionId });
    expect(sent).toHaveLength(0);
    const sub = await t.run((ctx) => ctx.db.get("subscriptions", subscriptionId));
    expect(sub?.lastReminderForRenewalAt).toBeUndefined();
  });
});
