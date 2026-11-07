import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Pagina con dati inventati (solo con E2E_FIXTURES=1): copre cio' che il resto dei test non vede,
// perche' le pagine vere dipendono dai dati del server.

test("con il consenso esplicito (E2E_FIXTURES=1) la pagina di prova esiste", async ({ request }) => {
  // Senza la variabile risponde 404: verificato a parte dal comando di build di produzione.
  expect((await request.get("/c/fixture")).status()).toBe(200);
});

const PAGES = ["/c/fixture", "/c/fixture/projects", "/c/fixture/billing", "/c/fixture/subscriptions", "/c/fixture/documents"] as const;

for (const path of PAGES) {
  test(`accessibilita' di ${path}: nessuna violazione WCAG 2 A/AA`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
  });

  test(`nessuno scorrimento orizzontale in ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
}

test("menu laterale: ogni voce e' una pagina, la corrente e' segnalata, non ci sono schede (tabs)", async ({ page, isMobile }) => {
  await page.goto("/c/fixture");
  if (isMobile) await page.getByRole("button", { name: "Apri il menu" }).click();
  const nav = page.getByRole("navigation", { name: "Pagine" });
  await expect(nav.getByRole("link")).toHaveText(["Panoramica", "Progetti", "Fatture", "Abbonamenti", "Documenti"]);
  await expect(nav.getByRole("link", { name: "Panoramica" })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Fatture" }).click();
  await expect(page).toHaveURL(/\/c\/fixture\/billing$/);
  await expect(page.getByRole("heading", { level: 1, name: "Fatture" })).toBeVisible();
  await expect(page.getByText("Fattura 2026/014")).toBeVisible();
  expect(await page.getByRole("tablist").count()).toBe(0);
});

test("la panoramica mostra le metriche calcolate dai dati del cliente", async ({ page }) => {
  await page.goto("/c/fixture");
  const kpis = page.getByRole("list", { name: "Riepilogo" });
  await expect(kpis).toContainText("Da pagare");
  await expect(kpis).toContainText("390");
  await expect(kpis).toContainText("scaduti");
  await expect(kpis).toContainText("Progetti in corso");
});

test("la panoramica del cliente mostra i dati aziendali di CORE829 SRL", async ({ page }) => {
  await page.goto("/c/fixture");
  await expect(page.getByText("CUI/CIF 54616345")).toBeVisible();
  await expect(page.getByRole("link", { name: "projects@core829.net" })).toBeVisible();
});

test("il menu a scomparsa su telefono si apre e si chiude con Esc", async ({ page, isMobile }) => {
  test.skip(!isMobile, "solo schermi piccoli");
  await page.goto("/c/fixture");
  const open = page.getByRole("button", { name: "Apri il menu" });
  await expect(page.getByRole("navigation", { name: "Pagine" })).toBeHidden();
  await open.click();
  await expect(page.getByRole("navigation", { name: "Pagine" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Pagine" })).toBeHidden();
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

// ---- Editor dei documenti (dati inventati) ----

test("editor documenti: nessuna violazione WCAG 2 A/AA e nessuno scorrimento orizzontale", async ({ page }) => {
  await page.goto("/c/fixture/editor");
  await expect(page.getByRole("heading", { level: 1, name: /Master Services Agreement/ })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test("editor documenti: i campi compilati e il testo modificato segnano le modifiche, il salvataggio le azzera", async ({ page }) => {
  await page.goto("/c/fixture/editor");
  await expect(page.getByText(/compilati su/)).toBeVisible();
  await expect(page.getByText("Modifiche non salvate")).toHaveCount(0);
  const save = page.getByRole("button", { name: "Salva" });
  await expect(save).toBeDisabled();

  await page.getByLabel(/^\{\{client\.name\}\}/).fill("Caffè Rosso Srl");
  await page.getByRole("textbox", { name: "Paragrafo 7", exact: true }).fill("1.1 Testo riscritto a mano.");
  await expect(page.getByText("Modifiche non salvate")).toBeVisible();
  await expect(page.getByText(/1 compilati su/)).toBeVisible();
  // Un paragrafo riscritto blocca i suoi campi: si compila da lì.
  await page.getByRole("textbox", { name: "Paragrafo 8", exact: true }).fill("Data di efficacia: 12/11/2026");
  await expect(page.getByText("Hai riscritto a mano il paragrafo: compila da lì.").first()).toBeVisible();

  await save.click();
  await expect(page.getByText("Modifiche non salvate")).toHaveCount(0);
});

test("editor documenti: aggiungi ed elimina paragrafi, caselle accessibili, ricerca e pagine", async ({ page }) => {
  await page.goto("/c/fixture/editor");
  await page.getByRole("button", { name: "Aggiungi un paragrafo dopo il 7", exact: true }).click();
  await page.getByRole("textbox", { name: "Nuovo paragrafo 1 dopo il 7" }).fill("Paragrafo nuovo");
  await page.getByRole("button", { name: "Elimina il paragrafo 1", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Paragrafo 1", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Ripristina il paragrafo 1", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Paragrafo 1", exact: true })).toBeEnabled();

  const box = page.getByRole("checkbox", { name: /Sviluppo software/ });
  await expect(box).toHaveAttribute("aria-checked", "false");
  await box.click();
  await expect(box).toHaveAttribute("aria-checked", "true");

  await page.getByRole("searchbox", { name: "Cerca nel testo" }).fill("Clausola 40.1");
  await expect(page.getByText("1 paragrafi")).toBeVisible();
  await page.getByRole("searchbox", { name: "Cerca nel testo" }).fill("");
  await page.getByRole("button", { name: "Successiva" }).click();
  await expect(page.getByText(/Pagina 2 di/)).toBeVisible();
});

test("editor documenti: la finestra di invio propone email del cliente, oggetto e formati", async ({ page }) => {
  await page.goto("/c/fixture/editor");
  await page.getByRole("button", { name: "Invia al cliente" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Destinatario")).toHaveValue("mario@caffe.it");
  await expect(dialog.getByLabel("Oggetto")).toHaveValue(/Master Services Agreement/);
  await expect(dialog.getByRole("checkbox", { name: "PDF" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Word/ })).not.toBeChecked();
  await dialog.getByRole("checkbox", { name: "PDF" }).uncheck();
  await dialog.getByRole("button", { name: "Invia ora" }).click();
  await expect(page.getByText("Scegli almeno un formato da allegare.")).toBeVisible();
});
