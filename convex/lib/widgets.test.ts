import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { defaultLayout, MAX_WIDGETS, normalizeWidgets, type Widget } from "./widgets";

function errorOf(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

describe("defaultLayout", () => {
  it("contiene ogni blocco di sistema, una volta sola e attivo", () => {
    const layout = defaultLayout();
    expect(layout.map((w) => w.type)).toEqual(["welcome", "onboarding", "summary", "projects", "billing", "subscriptions", "documents"]);
    expect(layout.every((w) => w.enabled)).toBe(true);
    expect(() => normalizeWidgets(layout)).not.toThrow();
  });
});

describe("normalizeWidgets", () => {
  it("ripulisce i testi dei blocchi liberi", () => {
    const [w] = normalizeWidgets([{ id: "a1", type: "notice", enabled: true, title: "  Chiusura\u0000 estiva ", body: "Torniamo\n\n\n\nil 20." }]);
    expect(w).toMatchObject({ title: "Chiusura estiva", body: "Torniamo\n\nil 20." });
  });

  it("mantiene il codice HTML come semplice testo (verra' mostrato con l'escape)", () => {
    const [w] = normalizeWidgets([{ id: "a1", type: "notice", enabled: true, title: "<b>x</b>", body: "<script>alert(1)</script>" }]);
    expect(w).toMatchObject({ title: "<b>x</b>", body: "<script>alert(1)</script>" });
  });

  it("accetta solo link https, senza credenziali", () => {
    const ok: Widget = { id: "l1", type: "links", enabled: true, title: "Utili", items: [{ label: "Sito", url: "https://core829.net/x" }] };
    expect(() => normalizeWidgets([ok])).not.toThrow();
    // eslint-disable-next-line no-script-url -- input malevolo: il test verifica che venga rifiutato
    for (const url of ["javascript:alert(1)", "http://core829.net", "https://u:p@core829.net", "data:text/html,x", "core829.net"]) {
      const bad: Widget = { id: "l1", type: "links", enabled: true, title: "Utili", items: [{ label: "x", url }] };
      expect(errorOf(() => normalizeWidgets([bad])), url).toBeInstanceOf(ConvexError);
    }
  });

  it("limita il numero di blocchi e di link", () => {
    const many = Array.from({ length: MAX_WIDGETS + 1 }, (_, i): Widget => ({ id: `n${i}`, type: "notice", enabled: true, title: "t", body: "b" }));
    expect(errorOf(() => normalizeWidgets(many))).toBeInstanceOf(ConvexError);
    const items = Array.from({ length: 11 }, () => ({ label: "x", url: "https://core829.net" }));
    expect(errorOf(() => normalizeWidgets([{ id: "l", type: "links", enabled: true, title: "t", items }]))).toBeInstanceOf(ConvexError);
    expect(errorOf(() => normalizeWidgets([{ id: "l", type: "links", enabled: true, title: "t", items: [] }]))).toBeInstanceOf(ConvexError);
  });

  it("un blocco di sistema compare una volta sola", () => {
    const twice: Widget[] = [
      { id: "projects", type: "projects", enabled: true },
      { id: "projects-2", type: "projects", enabled: true },
    ];
    expect(errorOf(() => normalizeWidgets(twice))).toBeInstanceOf(ConvexError);
  });

  it("rifiuta identificativi duplicati o con caratteri strani", () => {
    const dup: Widget[] = [
      { id: "x", type: "notice", enabled: true, title: "a", body: "b" },
      { id: "x", type: "notice", enabled: true, title: "a", body: "b" },
    ];
    expect(errorOf(() => normalizeWidgets(dup))).toBeInstanceOf(ConvexError);
    expect(errorOf(() => normalizeWidgets([{ id: "../etc", type: "notice", enabled: true, title: "a", body: "b" }]))).toBeInstanceOf(ConvexError);
  });

  it("scarta i campi sconosciuti (non passano dati extra)", () => {
    const sneaky = { id: "projects", type: "projects", enabled: true, evil: "x" } as unknown as Widget;
    expect(normalizeWidgets([sneaky])[0]).toEqual({ id: "projects", type: "projects", enabled: true });
  });

  it("titolo e testo sono obbligatori", () => {
    expect(errorOf(() => normalizeWidgets([{ id: "a", type: "notice", enabled: true, title: "  ", body: "b" }]))).toBeInstanceOf(ConvexError);
  });
});
