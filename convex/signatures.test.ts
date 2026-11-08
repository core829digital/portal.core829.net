/// <reference types="vite/client" />
import { createHash } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CONSENT_VERSION, cleanSignerName } from "./lib/signature";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.UTC(2026, 10, 15, 10, 0, 0);
const asUser = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId}|s1`, issuer: "https://test.local", tokenIdentifier: `https://test.local|${userId}|s1` });
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { data?: { code?: string } }).data?.code ?? `ERR:${String(e).slice(0, 80)}`;
  }
};
const msg = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { data?: { message?: string } }).data?.message ?? String(e);
  }
};

async function pdfBytes(text = "Contratto di prova"): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText(text, { x: 60, y: 700, size: 14 });
  return pdf.save();
}

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: "stefan@core829.net", addedAt: Date.now() }));
  const mk = (email: string) => t.run((ctx) => ctx.db.insert("users", { email, emailVerificationTime: Date.now() }));
  const admin = asUser(t, await mk("stefan@core829.net"));
  const stranger = asUser(t, await mk("altro@esempio.it"));
  const client = (n: string) => t.run((ctx) => ctx.db.insert("clients", { displayName: `Cliente ${n}`, contactName: n, email: `${n}@esempio.it`, packageType: "standard", status: "active" }));
  const clientA = await client("a");
  const clientB = await client("b");
  const addDoc = async (clientId: Id<"clients">, opts: { bytes?: Uint8Array; mime?: string; scan?: "clean" | "pending" | "rejected"; visible?: boolean } = {}) => {
    const bytes = opts.bytes ?? (await pdfBytes());
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([bytes as BlobPart], { type: opts.mime ?? "application/pdf" })));
    const documentId = await t.run((ctx) =>
      ctx.db.insert("documents", { clientId, kind: "contract", title: "Contratto MSA", storageId, fileName: "contratto.pdf", mimeType: opts.mime ?? "application/pdf", sizeBytes: bytes.length, scanStatus: opts.scan ?? "clean", visibleToClient: opts.visible ?? false }),
    );
    return { documentId, storageId, bytes };
  };
  const unlock = async (clientId: Id<"clients">) => {
    const link = await admin.mutation(api.accessLinks.create, { clientId });
    const { code: c } = await t.mutation(internal.otp.issueCode, { linkId: link.linkId });
    const r = await t.mutation(api.otp.verifyCode, { token: link.token, code: c });
    if (!r.ok) throw new Error("sblocco fallito");
    return { token: link.token, unlockToken: r.unlockToken };
  };
  return { t, admin, stranger, clientA, clientB, addDoc, unlock };
}

const signArgs = (s: { token: string; unlockToken: string }, requestId: Id<"signatureRequests">, over: Record<string, unknown> = {}) => ({
  ...s,
  requestId,
  fullName: "Mario Rossi",
  consent: true,
  consentVersion: CONSENT_VERSION,
  ip: "203.0.113.7",
  userAgent: "Mozilla/5.0 (prova)",
  ...over,
});

async function textOf(bytes: Uint8Array): Promise<string> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true } as Parameters<typeof pdfjs.getDocument>[0]).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) out += (await (await doc.getPage(i)).getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  return out;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  process.env.RESEND_API_KEY = "re_x";
  process.env.AUTH_EMAIL_FROM = "CORE829 <portal@core829.net>";
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "m" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("nome del firmatario", () => {
  it("accetta nome e cognome veri, rifiuta il resto", () => {
    expect(cleanSignerName("  Mario   Rossi ")).toBe("Mario Rossi");
    expect(cleanSignerName("Anna-Maria D'Angelo")).toBe("Anna-Maria D'Angelo");
    expect(cleanSignerName("José Álvarez")).toBe("José Álvarez");
    for (const bad of ["", "Mario", "M R", "12345 6789", "<b>Mario</b> Rossi", "Mario\nRossi=cmd", "x".repeat(100), "Mario @ Rossi"]) expect(cleanSignerName(bad), bad).toBeNull();
  });
});

describe("firma elettronica: richiesta (amministratore)", () => {
  it("solo l'admin chiede e revoca; il PDF diventa visibile al cliente; non si duplica", async () => {
    const h = await setup();
    const { documentId } = await h.addDoc(h.clientA);
    expect(await code(h.t.mutation(api.signatures.requestForDocument, { documentId }))).toBe("UNAUTHENTICATED");
    expect(await code(h.stranger.mutation(api.signatures.requestForDocument, { documentId }))).toBe("FORBIDDEN");
    const id = await h.admin.mutation(api.signatures.requestForDocument, { documentId });
    expect((await h.t.run((ctx) => ctx.db.get("documents", documentId)))!.visibleToClient).toBe(true);
    expect(await code(h.admin.mutation(api.signatures.requestForDocument, { documentId }))).toBe("CONFLICT");
    const list = await h.admin.query(api.signatures.list, {});
    expect(list[0]).toMatchObject({ id, status: "pending", clientName: "Cliente a", title: "Contratto MSA" });
    expect(await code(h.stranger.mutation(api.signatures.revoke, { requestId: id }))).toBe("FORBIDDEN");
    await h.admin.mutation(api.signatures.revoke, { requestId: id });
    expect((await h.admin.query(api.signatures.list, {}))[0].status).toBe("revoked");
  });

  it("rifiuta file non PDF, non controllati o inesistenti", async () => {
    const h = await setup();
    const word = await h.addDoc(h.clientA, { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const unsafe = await h.addDoc(h.clientA, { scan: "pending" });
    expect(await code(h.admin.mutation(api.signatures.requestForDocument, { documentId: word.documentId }))).toBe("BAD_STATE");
    expect(await code(h.admin.mutation(api.signatures.requestForDocument, { documentId: unsafe.documentId }))).toBe("BAD_STATE");
  });

  it("l'email di richiesta parte verso il cliente e non contiene segreti", async () => {
    const h = await setup();
    const { documentId } = await h.addDoc(h.clientA);
    await h.admin.mutation(api.signatures.requestForDocument, { documentId });
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { to: string | string[]; subject: string; text: string };
    expect([sent.to].flat()).toEqual(["a@esempio.it"]);
    expect(sent.subject).toContain("Da firmare");
    expect(sent.text).not.toMatch(/token|unlock/i);
  });
});

describe("firma elettronica: il cliente firma", () => {
  async function ready() {
    const h = await setup();
    const doc = await h.addDoc(h.clientA);
    const requestId = await h.admin.mutation(api.signatures.requestForDocument, { documentId: doc.documentId });
    const session = await h.unlock(h.clientA);
    return { h, doc, requestId, session };
  }

  it("firma: copia firmata con certificato, prove registrate, originale intatto, email a cliente e CORE829", async () => {
    const { h, doc, requestId, session } = await ready();
    const out = await h.t.action(internal.signActions.sign, signArgs(session, requestId));
    const signed = (await h.t.run((ctx) => ctx.db.get("documents", out.signedDocumentId as Id<"documents">)))!;
    expect(signed).toMatchObject({ clientId: h.clientA, title: "Contratto MSA — firmato", visibleToClient: true, scanStatus: "clean", kind: "contract" });
    const stored = await h.t.run(async (ctx) => Array.from(new Uint8Array(await (await ctx.storage.get(signed.storageId))!.arrayBuffer())));
    const signedPdf = new Uint8Array(stored);
    expect((await PDFDocument.load(signedPdf)).getPageCount()).toBe(2);
    const text = await textOf(signedPdf);
    expect(text).toContain("Certificato di firma elettronica");
    expect(text).toContain("Mario Rossi");
    expect(text).toContain("203.0.113.7");
    expect(text.replace(/\s/g, "")).toContain(createHash("sha256").update(doc.bytes).digest("hex"));
    expect(text).toContain("910/2014");
    // Prove nella richiesta; originale mai modificato.
    const r = (await h.t.run((ctx) => ctx.db.get("signatureRequests", requestId)))!;
    expect(r).toMatchObject({ status: "signed", signedName: "Mario Rossi", ip: "203.0.113.7", consentVersion: CONSENT_VERSION, signedDocumentId: signed._id });
    expect(r.signedSha256).toBe(createHash("sha256").update(signedPdf).digest("hex"));
    const original = await h.t.run(async (ctx) => Array.from(new Uint8Array(await (await ctx.storage.get(doc.storageId))!.arrayBuffer())));
    expect(new Uint8Array(original)).toEqual(doc.bytes);
    expect(r.otpVerifiedAt).toBeLessThanOrEqual(r.signedAt!);
    // Email di conferma: cliente + ufficio, con allegato.
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    const recipients = fetchMock.mock.calls.map((c) => [(JSON.parse(String(c[1].body)) as { to: string | string[] }).to].flat()[0]).sort();
    expect(recipients).toEqual(["a@esempio.it", "a@esempio.it", "office@core829.net"].sort());
    const withAttachment = fetchMock.mock.calls.map((c) => JSON.parse(String(c[1].body)) as { attachments?: unknown[] }).filter((b) => b.attachments);
    expect(withAttachment).toHaveLength(2);
    const log = await h.t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["signature.requested", "signature.signed"]));
    // Il cliente vede lo stato; l'admin vede chi e quando.
    const mine = await h.t.query(api.signatures.forClient, session);
    expect(mine[0]).toMatchObject({ status: "signed", signedName: "Mario Rossi", signedDocumentId: signed._id });
    expect((await h.admin.query(api.signatures.list, {}))[0]).toMatchObject({ status: "signed", signedName: "Mario Rossi", ip: "203.0.113.7" });
  });

  it("non si firma due volte: la firma in corso blocca la seconda; dopo la firma la richiesta e' chiusa", async () => {
    const { h, requestId, session } = await ready();
    // Due richieste quasi insieme: la seconda trova la firma gia' in corso (blocco prima di qualsiasi lavoro sul file).
    await h.t.mutation(internal.signatures.begin, { token: session.token, unlockToken: session.unlockToken, requestId });
    expect(await msg(h.t.mutation(internal.signatures.begin, { token: session.token, unlockToken: session.unlockToken, requestId }))).toMatch(/già in corso/);
    await h.t.mutation(internal.signatures.release, { requestId });
    await h.t.action(internal.signActions.sign, signArgs(session, requestId));
    expect((await h.t.run((ctx) => ctx.db.query("documents").collect())).filter((d) => d.title.endsWith("firmato"))).toHaveLength(1);
    expect(await msg(h.t.action(internal.signActions.sign, signArgs(session, requestId)))).toMatch(/già firmato/);
    expect((await h.t.run((ctx) => ctx.db.query("documents").collect())).filter((d) => d.title.endsWith("firmato"))).toHaveLength(1);
  });

  it("una firma rimasta bloccata (errore a meta') si sblocca da sola dopo 5 minuti", async () => {
    const { h, requestId, session } = await ready();
    await h.t.mutation(internal.signatures.begin, { token: session.token, unlockToken: session.unlockToken, requestId });
    vi.setSystemTime(NOW + 6 * 60 * 1000);
    await h.t.action(internal.signActions.sign, signArgs(session, requestId));
    expect((await h.t.run((ctx) => ctx.db.get("signatureRequests", requestId)))!.status).toBe("signed");
  });

  it("serve il consenso, un nome vero, la versione giusta del testo", async () => {
    const { h, requestId, session } = await ready();
    expect(await code(h.t.action(internal.signActions.sign, signArgs(session, requestId, { consent: false })))).toBe("BAD_STATE");
    expect(await code(h.t.action(internal.signActions.sign, signArgs(session, requestId, { fullName: "Mario" })))).toBe("BAD_STATE");
    expect(await code(h.t.action(internal.signActions.sign, signArgs(session, requestId, { fullName: "<script>x</script> Y" })))).toBe("BAD_STATE");
    expect(await code(h.t.action(internal.signActions.sign, signArgs(session, requestId, { consentVersion: "vecchia" })))).toBe("BAD_STATE");
    expect((await h.t.run((ctx) => ctx.db.get("signatureRequests", requestId)))!.status).toBe("pending");
  });

  it("serve un codice confermato da meno di 10 minuti e il codice giusto del link", async () => {
    const { h, requestId, session } = await ready();
    expect(await code(h.t.action(internal.signActions.sign, signArgs({ ...session, unlockToken: "x".repeat(43) }, requestId)))).toBe("UNLOCK_REQUIRED");
    vi.setSystemTime(NOW + 11 * 60 * 1000);
    expect(await msg(h.t.action(internal.signActions.sign, signArgs(session, requestId)))).toMatch(/codice appena ricevuto/);
    expect((await h.t.run((ctx) => ctx.db.get("signatureRequests", requestId)))!.status).toBe("pending");
    // Nuovo codice: si puo' firmare.
    const fresh = await h.unlock(h.clientA);
    await h.t.action(internal.signActions.sign, signArgs(fresh, requestId));
  });

  it("un altro cliente non puo' firmare la richiesta; richieste scadute, revocate o con file cambiato non si firmano", async () => {
    const { h, doc, requestId, session } = await ready();
    const other = await h.unlock(h.clientB);
    expect(await code(h.t.action(internal.signActions.sign, signArgs(other, requestId)))).toBe("NOT_FOUND");
    // File cambiato dopo la richiesta: impronta diversa, firma rifiutata e richiesta ancora disponibile.
    const other2 = await pdfBytes("ALTRO TESTO");
    await h.t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob([other2 as BlobPart], { type: "application/pdf" }));
      await ctx.db.patch("documents", doc.documentId, { storageId: id });
    });
    expect(await msg(h.t.action(internal.signActions.sign, signArgs(session, requestId)))).toMatch(/è cambiato/);
    expect((await h.t.run((ctx) => ctx.db.get("signatureRequests", requestId)))!.status).toBe("pending");
    // Scaduta.
    vi.setSystemTime(NOW + 31 * 24 * 3600 * 1000);
    const late = await h.unlock(h.clientA);
    expect(await msg(h.t.action(internal.signActions.sign, signArgs(late, requestId)))).toMatch(/scaduta/);
    expect((await h.admin.query(api.signatures.list, {}))[0].status).toBe("expired");
    // Revocata.
    vi.setSystemTime(NOW);
    await h.admin.mutation(api.signatures.revoke, { requestId });
    const again = await h.unlock(h.clientA);
    expect(await msg(h.t.action(internal.signActions.sign, signArgs(again, requestId)))).toMatch(/annullata/);
    expect(await h.t.query(api.signatures.forClient, again)).toHaveLength(0);
  });

  it("l'elenco del cliente richiede lo sblocco e mostra solo le sue richieste", async () => {
    const { h, session } = await ready();
    const docB = await h.addDoc(h.clientB);
    await h.admin.mutation(api.signatures.requestForDocument, { documentId: docB.documentId });
    expect(await code(h.t.query(api.signatures.forClient, { token: session.token, unlockToken: "x".repeat(43) }))).toBe("UNLOCK_REQUIRED");
    const mine = await h.t.query(api.signatures.forClient, session);
    expect(mine).toHaveLength(1);
    expect(JSON.stringify(mine)).not.toContain("esempio.it");
    expect(JSON.stringify(mine)).not.toContain("storageId");
  });

  it("un documento firmato non si elimina senza conferma esplicita", async () => {
    const { h, doc, requestId, session } = await ready();
    const out = await h.t.action(internal.signActions.sign, signArgs(session, requestId));
    expect(await code(h.admin.mutation(api.documents.remove, { documentId: out.signedDocumentId as Id<"documents"> }))).toBe("BAD_STATE");
    expect(await code(h.admin.mutation(api.documents.remove, { documentId: doc.documentId }))).toBe("BAD_STATE");
    await h.admin.mutation(api.documents.remove, { documentId: out.signedDocumentId as Id<"documents">, confirmSent: true });
  });

  it("endpoint /portal/sign: registra l'IP dall'intestazione, rifiuta richieste incomplete e non rivela dettagli", async () => {
    const { h, requestId, session } = await ready();
    const post = (body: unknown, headers: Record<string, string> = {}) =>
      h.t.fetch("/portal/sign", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
    expect((await post({ token: session.token })).status).toBe(400);
    expect((await h.t.fetch("/portal/sign", { method: "POST", body: "non json" })).status).toBe(400);
    const bad = await post({ ...signArgs(session, requestId), ip: undefined, fullName: "Mario" });
    expect(bad.status).toBe(409);
    const ok = await post({ token: session.token, unlockToken: session.unlockToken, requestId, fullName: "Mario Rossi", consent: true, consentVersion: CONSENT_VERSION }, { "x-forwarded-for": "198.51.100.9, 10.0.0.1", "user-agent": "TestBrowser/1.0" });
    expect(ok.status).toBe(200);
    const r = (await h.t.run((ctx) => ctx.db.get("signatureRequests", requestId)))!;
    expect(r).toMatchObject({ status: "signed", ip: "198.51.100.9", userAgent: "TestBrowser/1.0" });
    const again = await post({ token: session.token, unlockToken: session.unlockToken, requestId, fullName: "Mario Rossi", consent: true, consentVersion: CONSENT_VERSION });
    expect(again.status).toBe(409);
  });
});
