import { afterEach, describe, expect, it, vi } from "vitest";
import { checkHashReputation } from "./hashReputation";

const HASH = "a".repeat(64);
afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: unknown = {}) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("checkHashReputation", () => {
  it("invia solo l'impronta, con la chiave nell'intestazione", async () => {
    const f = reply(200, { data: { attributes: { last_analysis_stats: { malicious: 0 } } } });
    vi.stubGlobal("fetch", f);
    expect(await checkHashReputation("chiave", HASH)).toBe("clean");
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://www.virustotal.com/api/v3/files/${HASH}`);
    expect((init.headers as Record<string, string>)["x-apikey"]).toBe("chiave");
    expect(init.body).toBeUndefined();
  });
  it("riconosce il malware noto", async () => {
    vi.stubGlobal("fetch", reply(200, { data: { attributes: { last_analysis_stats: { malicious: 7 } } } }));
    expect(await checkHashReputation("k", HASH)).toBe("malicious");
  });
  it("file sconosciuto: 404", async () => {
    vi.stubGlobal("fetch", reply(404));
    expect(await checkHashReputation("k", HASH)).toBe("unknown");
  });
  it("errori di servizio o di rete", async () => {
    vi.stubGlobal("fetch", reply(429));
    expect(await checkHashReputation("k", HASH)).toBe("error");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("rete")));
    expect(await checkHashReputation("k", HASH)).toBe("error");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("non json", { status: 200 })));
    expect(await checkHashReputation("k", HASH)).toBe("error");
  });
  it("un'impronta non valida non arriva mai alla rete", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    for (const bad of ["", "abc", "../../etc/passwd", "A".repeat(64), `${HASH}/x`]) {
      expect(await checkHashReputation("k", bad)).toBe("error");
    }
    expect(f).not.toHaveBeenCalled();
  });
});
