import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "./resend";

const message = { from: "CORE829 <portal@core829.net>", to: "cliente@esempio.it", subject: "Codice", text: "123456", html: "<p>123456</p>" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendEmail", () => {
  it("chiama l'API di Resend con la chiave nell'header e il destinatario come elenco", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendEmail("re_chiave_segreta", message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_chiave_segreta");
    const body = JSON.parse(init.body as string);
    expect(body.to).toEqual(["cliente@esempio.it"]);
    expect(body.subject).toBe("Codice");
    // La chiave non finisce mai nel corpo del messaggio.
    expect(init.body as string).not.toContain("re_chiave_segreta");
  });

  it("se Resend risponde con un errore lancia un errore generico, senza esporre la chiave", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"message":"dominio non verificato"}', { status: 403 })));
    const error = await sendEmail("re_chiave_segreta", message).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("re_chiave_segreta");
    expect((error as Error).message).not.toContain("dominio non verificato");
  });

  it("se la rete fallisce lancia un errore generico", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connessione a re_chiave_segreta rifiutata")));
    const error = await sendEmail("re_chiave_segreta", message).catch((e: Error) => e);
    expect((error as Error).message).toBe("Invio dell'email non riuscito.");
  });
});
