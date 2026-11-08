/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const asUser = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId}|s1`, issuer: "https://test.local", tokenIdentifier: `https://test.local|${userId}|s1` });
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { data?: { code?: string } }).data?.code ?? "ERR";
  }
};

async function setup() {
  const t = convexTest(schema, modules);
  const mkUser = (email: string, verified = true) => t.run((ctx) => ctx.db.insert("users", verified ? { email, emailVerificationTime: Date.now() } : { email }));
  await t.run((ctx) => ctx.db.insert("admins", { email: "stefan@core829.net", addedAt: Date.now() }));
  const admin = asUser(t, await mkUser("stefan@core829.net"));
  await admin.mutation(api.team.addAgent, { email: "Agente@Esempio.it", name: "Anna Rossi" });
  const agent = asUser(t, await mkUser("agente@esempio.it"));
  const stranger = asUser(t, await mkUser("intruso@esempio.it"));
  return { t, admin, agent, stranger, mkUser };
}

describe("team: amministratori e agenti", () => {
  it("l'agente e' del team ma NON e' amministratore: il portale resta chiuso", async () => {
    const h = await setup();
    expect(await h.agent.query(api.admins.me, {})).toMatchObject({ isAdmin: false, isTeam: true, role: "agent", name: "Anna Rossi" });
    expect(await h.admin.query(api.admins.me, {})).toMatchObject({ isAdmin: true, isTeam: true, role: "admin" });
    expect(await h.stranger.query(api.admins.me, {})).toMatchObject({ isAdmin: false, isTeam: false });
    // Funzioni admin: l'agente e' rifiutato come chiunque altro.
    const adminCalls = {
      "clients.list": (c: typeof h.agent) => c.query(api.clients.list, { paginationOpts: { numItems: 5, cursor: null } }),
      "team.list": (c: typeof h.agent) => c.query(api.team.list, {}),
      "team.addAgent": (c: typeof h.agent) => c.mutation(api.team.addAgent, { email: "x@y.it", name: "Xx" }),
      "documents.generateUploadUrl": (c: typeof h.agent) => c.mutation(api.documents.generateUploadUrl, {}),
    };
    for (const [name, call] of Object.entries(adminCalls)) {
      expect(await code(call(h.agent)), `${name} agente`).toBe("FORBIDDEN");
      expect(await code(call(h.stranger)), `${name} estraneo`).toBe("FORBIDDEN");
      expect(await code(call(h.t as unknown as typeof h.agent)), `${name} anonimo`).toBe("UNAUTHENTICATED");
    }
  });

  it("i membri vedono i colleghi (senza email); gli estranei no", async () => {
    const h = await setup();
    const list = await h.agent.query(api.team.members, {});
    expect(list.map((m) => m.name).sort()).toEqual(["Anna Rossi", "stefan"]);
    expect(JSON.stringify(list)).not.toContain("@");
    expect(await code(h.stranger.query(api.team.members, {}))).toBe("FORBIDDEN");
  });

  it("solo l'admin gestisce gli agenti; email unica; gli admin non si eliminano da qui", async () => {
    const h = await setup();
    expect(await code(h.admin.mutation(api.team.addAgent, { email: "agente@esempio.it", name: "Doppio" }))).toBe("CONFLICT");
    expect(await code(h.agent.mutation(api.team.removeAgent, { memberId: (await h.t.run((ctx) => ctx.db.query("admins").first()))!._id }))).toBe("FORBIDDEN");
    const rows = await h.admin.query(api.team.list, {});
    const adminRow = rows.find((r) => r.role === "admin")!;
    const agentRow = rows.find((r) => r.role === "agent")!;
    expect(await code(h.admin.mutation(api.team.removeAgent, { memberId: adminRow.id }))).toBe("BAD_STATE");
    await h.admin.mutation(api.team.rename, { memberId: agentRow.id, name: "Anna Bianchi" });
    await h.admin.mutation(api.team.removeAgent, { memberId: agentRow.id });
    // Tolto dal team: perde subito l'accesso.
    expect(await h.agent.query(api.admins.me, {})).toMatchObject({ isTeam: false });
    expect(await code(h.agent.query(api.team.members, {}))).toBe("FORBIDDEN");
  });

  it("il codice di accesso parte anche per gli agenti registrati (non per gli estranei)", async () => {
    const h = await setup();
    expect(await h.t.query(internal.admins.isTeamEmail, { email: "AGENTE@esempio.it " })).toBe(true);
    expect(await h.t.query(internal.admins.isTeamEmail, { email: "intruso@esempio.it" })).toBe(false);
    expect(await h.t.query(internal.admins.isTeamEmail, { email: "" })).toBe(false);
  });

  it("un'email non verificata non basta, neppure se e' quella dell'agente", async () => {
    const h = await setup();
    const unverified = asUser(h.t, await h.mkUser("agente@esempio.it", false));
    expect(await unverified.query(api.admins.me, {})).toMatchObject({ isTeam: false });
  });
});
