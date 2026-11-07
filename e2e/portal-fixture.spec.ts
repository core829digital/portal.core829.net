import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Pagina con dati inventati (solo con E2E_FIXTURES=1): copre cio' che il resto dei test non vede,
// perche' le pagine vere dipendono dai dati del server.

test("con il consenso esplicito (E2E_FIXTURES=1) la pagina di prova esiste", async ({ request }) => {
  // Senza la variabile risponde 404: verificato a parte dal comando di build di produzione.
  expect((await request.get("/c/fixture")).status()).toBe(200);
});

test("accessibilita' con tutti i blocchi: nessuna violazione WCAG 2 A/AA", async ({ page }) => {
  await page.goto("/c/fixture");
  await expect(page.getByRole("heading", { name: "Ciao Mario" })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
});

test("nessuno scorrimento orizzontale con tutti i blocchi", async ({ page }) => {
  await page.goto("/c/fixture");
  await expect(page.getByRole("heading", { name: "Ciao Mario" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test("contenuto non fidato: il codice HTML dei blocchi liberi appare come testo e non viene eseguito", async ({ page }) => {
  let alerts = 0;
  page.on("dialog", async (d) => {
    alerts++;
    await d.dismiss();
  });
  await page.goto("/c/fixture");
  await expect(page.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
  await expect(page.getByText("<script>alert('xss')</script> testo normale")).toBeVisible();
  expect(await page.locator("main img[src='x'], main script").count()).toBe(0);
  expect(alerts).toBe(0);
});

test("i link esterni sono solo https e si aprono in modo sicuro", async ({ page }) => {
  await page.goto("/c/fixture");
  const links = page.locator("main a[target=_blank]");
  await expect(links).toHaveCount(1);
  await expect(links.first()).toHaveAttribute("href", "https://www.core829.net");
  await expect(links.first()).toHaveAttribute("rel", "noopener noreferrer");
  expect(await page.locator("main a[href^='http://']").count()).toBe(0);
});

test("la scheda introduttiva si chiude e resta chiusa", async ({ page }) => {
  await page.goto("/c/fixture");
  await expect(page.getByText("Come funziona questo spazio")).toBeVisible();
  await page.getByRole("button", { name: "Ho capito" }).click();
  await expect(page.getByText("Come funziona questo spazio")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ciao Mario" })).toBeVisible();
  await expect(page.getByText("Come funziona questo spazio")).toHaveCount(0);
});
