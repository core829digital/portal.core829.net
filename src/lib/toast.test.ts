import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAll, dismiss, getSnapshot, subscribe, toast } from "./toast";

beforeEach(() => {
  vi.useFakeTimers();
  clearAll();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("toast", () => {
  it("aggiunge i messaggi e avvisa chi ascolta", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    toast.success("Salvato");
    expect(getSnapshot().map((t) => t.message)).toEqual(["Salvato"]);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("scompare da solo: dopo 4 secondi il successo, dopo 8 l'errore", () => {
    toast.success("ok");
    toast.error("ko");
    vi.advanceTimersByTime(4001);
    expect(getSnapshot().map((t) => t.kind)).toEqual(["error"]);
    vi.advanceTimersByTime(4000);
    expect(getSnapshot()).toHaveLength(0);
  });

  it("mostra al massimo 4 messaggi e tronca i testi troppo lunghi", () => {
    for (let i = 0; i < 6; i++) toast.success(`m${i}`);
    expect(getSnapshot().map((t) => t.message)).toEqual(["m2", "m3", "m4", "m5"]);
    toast.error("x".repeat(1000));
    expect(getSnapshot().at(-1)?.message.length).toBe(300);
  });

  it("si puo' chiudere a mano", () => {
    const id = toast.success("ciao");
    dismiss(id);
    expect(getSnapshot()).toHaveLength(0);
  });

  it("dopo la cancellazione non notifica piu' chi si e' disiscritto", () => {
    const listener = vi.fn();
    subscribe(listener)();
    toast.success("x");
    expect(listener).not.toHaveBeenCalled();
  });
});
