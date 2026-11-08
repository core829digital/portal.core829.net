import { expect, test } from "@playwright/test";

/**
 * Regia delle animazioni della Panoramica: l'occhio deve poter seguire ogni passaggio, dall'inizio alla fine.
 * Ordine atteso: pagina → schede (una ogni ~110 ms) → numeri (scorrono DOPO che la scheda e' comparsa) → grafici (dopo la loro scheda).
 * I test girano con le animazioni attive (di default la prova le riduce).
 */
test.use({ reducedMotion: "no-preference", viewport: { width: 1280, height: 900 } });

test("le animazioni partono in ordine e finiscono tutte entro 3,5 s, senza sovrapporsi in un unico istante", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __log: { name: string; at: number; end: number }[] };
    w.__log = [];
    const seen = new WeakSet<Animation>();
    const poll = () => {
      for (const a of document.getAnimations()) {
        if (seen.has(a)) continue;
        seen.add(a);
        const t = a.effect?.getComputedTiming();
        const name = (a as CSSAnimation).animationName ?? "";
        if (!t || !name || /skeleton/.test(name)) continue;
        const at = (a.startTime as number) + (t.delay as number);
        w.__log.push({ name, at, end: at + (t.duration as number) });
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
  await page.goto("/c/fixture");
  await page.waitForTimeout(4200);
  const log = await page.evaluate(() => (window as unknown as { __log: { name: string; at: number; end: number }[] }).__log);

  const by = (n: string) => log.filter((l) => l.name === n);
  const pageIn = by("page-rise")[0];
  const cards = by("dash-rise");
  const charts = log.filter((l) => /grow|sweep|chart-reveal/.test(l.name));

  expect(pageIn, "entrata di pagina").toBeTruthy();
  expect(cards.length).toBeGreaterThan(3);
  // Le schede iniziano quando la pagina e' gia' in movimento e non tutte nello stesso istante.
  expect(Math.min(...cards.map((c) => c.at))).toBeGreaterThanOrEqual(pageIn.at + 200);
  expect(new Set(cards.map((c) => Math.round(c.at / 20))).size).toBeGreaterThan(3);
  // I grafici partono dopo che le prime schede sono comparse (non insieme a loro).
  expect(charts.length).toBeGreaterThan(3);
  expect(Math.min(...charts.map((c) => c.at))).toBeGreaterThanOrEqual(Math.min(...cards.map((c) => c.at)) + 700);
  // Nessuna animazione resta a meta' e tutte finiscono entro 3,5 s dall'apertura.
  expect(Math.max(...log.map((l) => l.end))).toBeLessThan(3500);
});

test("i numeri partono da zero, scorrono in modo visibile e si fermano sul valore esatto", async ({ page }) => {
  await page.goto("/c/fixture");
  const first = page.getByRole("list", { name: "Riepilogo" }).getByRole("listitem").first();
  const shown = first.locator('[aria-hidden="true"].tabular-nums').first();
  const final = (await first.locator(".sr-only").first().textContent())?.trim();
  const samples: string[] = [];
  for (const wait of [150, 700, 2600]) {
    await page.waitForTimeout(wait);
    samples.push(((await shown.textContent()) ?? "").trim());
  }
  const digits = (s: string) => Number(s.replace(/[^\d]/g, "") || 0);
  const target = digits(final ?? "0");
  expect(digits(samples[0]), "all'inizio e' ancora a zero").toBe(0);
  expect(digits(samples[1]), "a meta' sta salendo (ne' fermo a zero ne' gia' arrivato)").toBeGreaterThan(0);
  expect(digits(samples[1])).toBeLessThan(target);
  expect(samples[2]).toBe(final);
});
