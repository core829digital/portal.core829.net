/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

/**
 * OWASP A01 (controllo degli accessi), come rete di sicurezza per il futuro:
 * ogni funzione PUBBLICA di Convex (query / mutation / action) deve richiamare un controllo di accesso.
 * Se ne aggiungi una nuova senza, questo test fallisce. Le uniche eccezioni sono elencate qui sotto, con il motivo.
 */
const sources = import.meta.glob("./*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const CHECK = /requireAdmin|requireTeam|lookupAdmin|resolveLink|requireUnlock|requireFreshUnlock|assertAdmin|admin\(ctx\)|runQuery\(internal\.reports\.exportData|getAuthUserId/;

/** Funzioni pubbliche volutamente aperte: ricevono solo dati non sensibili o si proteggono da sole. */
const PUBLIC_ON_PURPOSE = new Set<string>([
  // (nessuna: ogni funzione pubblica oggi controlla l'accesso)
]);

describe("OWASP A01: nessuna funzione pubblica senza controllo di accesso", () => {
  it("ogni query/mutation/action esportata richiama un controllo", () => {
    const missing: string[] = [];
    for (const [file, src] of Object.entries(sources)) {
      if (file.includes(".test.") || file.endsWith("convex.config.ts") || file.endsWith("schema.ts")) continue;
      const parts = src.split(/\nexport const (\w+) = (query|mutation|action)\(/);
      for (let i = 1; i < parts.length; i += 3) {
        const name = parts[i];
        const body = (parts[i + 2] ?? "").split("\nexport ")[0];
        if (!CHECK.test(body) && !PUBLIC_ON_PURPOSE.has(`${file}:${name}`)) missing.push(`${file}:${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("il controllo e' davvero il primo passo (prima di leggere o scrivere dati) nelle funzioni del Centro notifiche", () => {
    const src = sources["./notifications.ts"];
    for (const name of ["list", "stats", "settings", "setEnabled", "retry"]) {
      const body = src.split(new RegExp(`export const ${name} = (query|mutation)\\(`))[2] ?? "";
      const guard = body.search(/requireAdmin/);
      const firstDb = body.search(/ctx\.db\./);
      expect(guard, name).toBeGreaterThan(-1);
      expect(guard, name).toBeLessThan(firstDb);
    }
  });
});
