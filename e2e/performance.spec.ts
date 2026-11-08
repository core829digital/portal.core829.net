import { expect, test, type Page } from "@playwright/test";

// Misura con le animazioni attive (come le vede un utente): non devono spostare il layout.
test.use({ reducedMotion: "no-preference" });

/**
 * Misure reali nel browser (solo Chromium: Firefox e WebKit non espongono tutte queste metriche).
 * Le soglie sono quelle "buone" di Google per i Core Web Vitals; localhost e' piu' veloce di un cliente
 * vero, quindi servono a notare regressioni grosse, non a certificare la velocita' in produzione.
 */
test.skip(({ browserName }) => browserName !== "chromium", "metriche disponibili solo in Chromium");

async function measure(page: Page, path: string) {
  await page.addInitScript(() => {
    const w = window as unknown as { __lcp: number; __cls: number };
    w.__lcp = 0;
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  let jsBytes = 0;
  page.on("response", async (r) => {
    if (r.url().endsWith(".js") || r.headers()["content-type"]?.includes("javascript")) jsBytes += Number(r.headers()["content-length"] ?? 0);
  });
  await page.goto(path, { waitUntil: "load" });
  await page.waitForTimeout(1500); // lascia assestare layout e font
  const m = await page.evaluate(() => {
    const w = window as unknown as { __lcp: number; __cls: number };
    return { lcp: w.__lcp, cls: w.__cls };
  });
  return { ...m, jsBytes };
}

for (const [name, path] of [["home", "/"], ["spazio cliente con tutti i blocchi", "/c/fixture"], ["login amministratore", "/admin/login"], ["fatture con stato economico animato", "/c/fixture/billing"], ["indicatori della panoramica", "/c/fixture/kpi"]] as const) {
  test(`${name}: LCP sotto 2,5 s e nessun salto di layout (CLS sotto 0,1)`, async ({ page }) => {
    const m = await measure(page, path);
    test.info().annotations.push({ type: "metriche", description: `LCP ${m.lcp.toFixed(0)} ms, CLS ${m.cls.toFixed(3)}, JS trasferito ${(m.jsBytes / 1024).toFixed(0)} KB` });
    expect(m.lcp, "LCP (ms)").toBeLessThan(2500);
    expect(m.cls, "CLS").toBeLessThan(0.1);
  });
}
