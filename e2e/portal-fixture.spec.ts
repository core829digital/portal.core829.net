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
  await expect(nav.getByRole("link")).toHaveText(["Panoramica", "Progetti", "Fatture", "Abbonamenti", "Documenti", "Report"]);
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

// ---- Anteprime dei documenti con caricamento pigro ----

test("anteprime: si caricano solo quando sono visibili, mostrano immagini e prima pagina dei PDF, icone per gli altri file", async ({ page }) => {
  await page.goto("/c/fixture/previews");
  const calls = async () => JSON.parse((await page.getByTestId("calls").textContent()) ?? "{}") as Record<string, number>;
  // In vista: caricate. Lontane: NON richieste (caricamento pigro).
  await expect.poll(async () => (await calls()).img1).toBe(1);
  await expect.poll(async () => (await calls()).pdf1).toBe(1);
  expect((await calls()).late1).toBeUndefined();
  expect((await calls()).late2).toBeUndefined();
  // Immagine vera, PDF disegnato (pixel non tutti bianchi).
  await expect(page.getByRole("button", { name: "Anteprima di Foto evento" }).locator("img")).toHaveAttribute("src", /^data:image/);
  const pdfCanvas = page.getByRole("button", { name: "Anteprima di Contratto" }).locator("canvas");
  await expect.poll(async () => pdfCanvas.evaluate((c: HTMLCanvasElement) => { const d = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data; if (!d) return 0; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 200) n++; return n; })).toBeGreaterThan(20);
  // Word/Excel: nessuna chiamata, icona con il tipo, pulsante disattivato.
  expect((await calls()).doc1).toBeUndefined();
  await expect(page.getByRole("button", { name: /Preventivo Word \(nessuna anteprima: DOCX\)/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Listino \(nessuna anteprima: XLSX\)/ })).toBeDisabled();
  // File rotto: icona al posto della miniatura, nessun errore in pagina.
  await expect(page.getByRole("button", { name: /File rotto \(nessuna anteprima/ })).toBeDisabled();
  // Scorrendo fino in fondo si caricano anche quelle lontane.
  await page.getByText("PDF in fondo").scrollIntoViewIfNeeded();
  await expect.poll(async () => (await calls()).late1).toBe(1);
  await expect.poll(async () => (await calls()).late2).toBe(1);
  // Le miniature gia' caricate non si richiedono di nuovo.
  expect((await calls()).img1).toBe(1);
});

test("anteprime: un clic apre l'anteprima grande (immagine e PDF a pagine), si chiude con Esc, senza violazioni WCAG", async ({ page }) => {
  await page.goto("/c/fixture/previews");
  await page.getByRole("button", { name: "Anteprima di Foto evento" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("img", { name: "Foto evento" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Anteprima di Contratto" }).click();
  await expect(dialog.getByRole("img", { name: "Pagina 1" })).toBeVisible();
  await expect(dialog.getByRole("img", { name: "Pagina 2" })).toBeAttached();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

// ---- Firma elettronica del cliente (comportamento inventato) ----

test("firma: serve aver letto il documento, scritto il nome e accettato le due dichiarazioni; gli errori si vedono", async ({ page }) => {
  await page.goto("/c/fixture/sign");
  const dialog = page.getByRole("dialog");
  const sign = dialog.getByRole("button", { name: "Firma il documento" });
  await expect(sign).toBeDisabled(); // prima va letto il documento
  await dialog.getByRole("button", { name: /Leggi il documento/ }).click();
  await expect(page.getByTestId("log")).toContainText("letto");
  await expect(sign).toBeEnabled();
  await dialog.getByLabel("Nome e cognome").fill("Nome Sbagliato");
  await sign.click();
  await expect(dialog.getByText("Per firmare devi accettare entrambe le dichiarazioni.")).toBeVisible();
  await expect(page.getByTestId("log")).not.toContainText("firma:");
  const boxes = dialog.getByRole("checkbox");
  await expect(boxes).toHaveCount(2);
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await sign.click();
  await expect(dialog.getByRole("alert")).toContainText("nome e cognome per esteso");
  // Codice troppo vecchio: propone di ricaricare per chiederne uno nuovo.
  await dialog.getByLabel("Nome e cognome").fill("Codice Vecchio");
  await sign.click();
  await expect(dialog.getByRole("button", { name: /richiedi un nuovo codice/i })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  // Firma riuscita: la finestra si chiude.
  await dialog.getByLabel("Nome e cognome").fill("Mario Rossi");
  await sign.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("log")).toContainText("firma:Mario Rossi");
});

// ---- Menu a tendina in stile core829.net ----

test("portale cliente: il menu «Contatta CORE829» si apre, si naviga da tastiera e si chiude con Esc", async ({ page }) => {
  await page.goto("/c/fixture");
  const trigger = page.getByRole("button", { name: /Contatta CORE829/ }).first();
  await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  await trigger.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveCount(3);
  await expect(menu.getByRole("menuitem", { name: /Scrivici/ })).toHaveAttribute("href", "mailto:hello@core829.net");
  await expect(menu.getByRole("menuitem", { name: /Chiamaci/ })).toHaveAttribute("href", /^tel:\+39/);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("pagina d'accesso: capsula in vetro con menu dei contatti, senza violazioni WCAG e senza scorrimento orizzontale", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Contattaci/ }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: /Compila il modulo/ })).toHaveAttribute("href", "https://core829.net/it/contatti");
  await page.keyboard.press("Escape");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

// ---- Menu a gruppi comprimibili ----

test("menu a gruppi: si apre e si chiude, ricorda la scelta, il gruppo della pagina corrente resta aperto", async ({ page, isMobile }) => {
  await page.goto("/fixture-nav");
  if (isMobile) await page.getByRole("button", { name: "Apri il menu" }).click();
  const nav = page.getByRole("navigation", { name: "Pagine" });
  const clienti = nav.getByRole("button", { name: /Clienti/ });
  const sistema = nav.getByRole("button", { name: /Sistema/ });
  await expect(clienti).toHaveAttribute("aria-expanded", "true");
  await expect(nav.getByRole("link", { name: "Tutti i clienti" })).toBeVisible();
  await expect(sistema).toHaveAttribute("aria-expanded", "false"); // chiuso di partenza
  await expect(nav.getByRole("link", { name: "Registro" })).toBeHidden();
  await clienti.click();
  await expect(clienti).toHaveAttribute("aria-expanded", "false");
  await expect(nav.getByRole("link", { name: "Tutti i clienti" })).toBeHidden();
  await sistema.click();
  await expect(nav.getByRole("link", { name: "Registro" })).toBeVisible();
  // La scelta si ricorda dopo il ricaricamento.
  await page.reload();
  if (isMobile) await page.getByRole("button", { name: "Apri il menu" }).click();
  await expect(nav.getByRole("button", { name: /Clienti/ })).toHaveAttribute("aria-expanded", "false");
  await expect(nav.getByRole("button", { name: /Sistema/ })).toHaveAttribute("aria-expanded", "true");
  // Tastiera: Invio sul titolo del gruppo lo riapre.
  await nav.getByRole("button", { name: /Clienti/ }).focus();
  await page.keyboard.press("Enter");
  await expect(nav.getByRole("link", { name: "Tutti i clienti" })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

// ---- Nessuna zona bianca in fondo alle pagine (bug: la tabella nascosta del grafico allungava la pagina) ----

for (const path of ["/c/fixture/site", "/c/fixture/chart", "/c/fixture", "/c/fixture/billing"]) {
  test(`${path}: la pagina finisce dove finisce il contenuto (nessuna zona bianca scrollando)`, async ({ page }) => {
    await page.goto(path);
    await page.waitForTimeout(1800);
    const { scrollHeight, contentBottom, viewport } = await page.evaluate(() => {
      const root = document.getElementById("contenuto") ?? document.body;
      const last = root.lastElementChild as HTMLElement | null;
      return { scrollHeight: document.documentElement.scrollHeight, contentBottom: (last ? last.getBoundingClientRect().bottom : 0) + window.scrollY, viewport: window.innerHeight };
    });
    // Margine ragionevole: spaziatura finale del contenuto (non centinaia di pixel vuoti).
    expect(scrollHeight - Math.max(contentBottom, viewport)).toBeLessThan(120);
  });
}

// ---- Grafico ad area: la linea deve arrivare fino all'ultimo mese ----

test("grafico incassi: la linea e l'area arrivano fino a novembre (ultimo punto) e il punto attivo e' l'ultimo", async ({ page }) => {
  await page.goto("/c/fixture/chart");
  const svg = page.getByTestId("area-svg");
  await expect(svg).toBeAttached();
  await page.waitForTimeout(2200); // fine dell'animazione
  const clip = await svg.evaluate((el) => getComputedStyle(el).clipPath);
  expect(clip).not.toContain("100%");
  // Il bordo destro della linea coincide con il bordo destro del grafico.
  const [box, line] = await Promise.all([svg.boundingBox(), page.getByTestId("area-line").boundingBox()]);
  expect(Math.abs(box!.x + box!.width - (line!.x + line!.width)), JSON.stringify({ box, line })).toBeLessThan(6);
  // Pixel rossi della linea presenti nell'ultimo 3% della larghezza.
  const png = await page.screenshot({ clip: { x: box!.x + box!.width * 0.94, y: box!.y, width: box!.width * 0.06 + 2, height: box!.height } });
  const red = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 190 && d[i + 1] < 80 && d[i + 2] < 90) n++;
    return n;
  }, png.toString("base64"));
  expect(red).toBeGreaterThan(5);
  await expect(page.getByText("NOV", { exact: true }).first()).toBeVisible();
  await expect(page.locator("figcaption")).toContainText("NOV");
  await expect(page.locator("figcaption")).toContainText("620 €");
});

// ---- Report mensili del cliente (dati inventati) ----

test("report mensili: nessuna violazione WCAG, nessuno scorrimento orizzontale, contenuto non fidato come testo", async ({ page }) => {
  await page.goto("/c/fixture/reports");
  await expect(page.getByRole("heading", { level: 1, name: "Report mensili" })).toBeVisible();
  await expect(page.getByText("Visite al sito")).toBeVisible();
  await expect(page.getByText("1520")).toBeVisible();
  await expect(page.getByText("+52%")).toBeVisible();
  await expect(page.getByText("-4,5 punti")).toBeVisible();
  await expect(page.getByText("2 min 05 s")).toBeVisible();
  await expect(page.getByText("<script>alert('xss')</script>")).toBeVisible(); // visibile come testo, non eseguito
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test("report mensili: si cambia mese, si chiede il PDF e il menu mostra la pagina Report", async ({ page, isMobile }) => {
  await page.goto("/c/fixture/reports");
  const oct = page.getByRole("button", { name: "ottobre 2026" });
  await expect(oct).toHaveAttribute("aria-pressed", "false");
  await oct.click();
  await expect(oct).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Report non disponibile.")).toBeVisible();
  await page.getByRole("button", { name: "novembre 2026" }).click();
  await page.getByRole("button", { name: "Scarica il PDF" }).click();
  await expect(page.getByTestId("downloads")).toHaveText("Download richiesti: 1");
  if (!isMobile) await expect(page.getByRole("link", { name: "Report", exact: true })).toBeVisible();
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
  await page.getByRole("tab", { name: "Modifica il testo" }).click();
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
  await page.getByRole("tab", { name: "Modifica il testo" }).click();
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

test("editor documenti: l'anteprima live si aggiorna subito mentre compili e si torna al campo con un clic", async ({ page }) => {
  await page.goto("/c/fixture/editor");
  const paper = page.getByRole("article", { name: "Anteprima del documento" });
  await expect(paper).toContainText("Firma del Cliente:");
  const field = paper.locator('[data-field="p10.0"]');
  await expect(field).toHaveAttribute("data-filled", "false");
  // Compilare dal pannello aggiorna la carta nello stesso istante, senza salvare.
  await page.getByLabel(/^Firma del Cliente/).first().fill("Mario Rossi");
  await expect(paper.locator('[data-field="p10.0"]')).toHaveText("Mario Rossi");
  await expect(paper.locator('[data-field="p10.0"]')).toHaveAttribute("data-filled", "true");
  await expect(page.getByText(/campi? vuot/)).toBeVisible();
  // La casella si spunta e appare nell'anteprima.
  await page.getByRole("checkbox", { name: /Sviluppo software/ }).click();
  await expect(paper).toContainText("☒");
  // Un clic su un campo dell'anteprima porta al suo campo di compilazione.
  await paper.locator('[data-field="p8.0"]').click();
  await expect(page.locator("#f-p8\\.0")).toBeFocused();
  // Un clic sul testo porta al paragrafo da correggere.
  await paper.getByText("ARTICOLO 1 DEFINIZIONI").click();
  await expect(page.getByRole("textbox", { name: "Paragrafo 6", exact: true })).toBeFocused();
});

test("editor documenti: la finestra di invio propone email del cliente, oggetto e formati", async ({ page }) => {
  await page.goto("/c/fixture/editor");
  await page.getByRole("button", { name: "Invia al cliente" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Destinatario")).toHaveValue("mario@caffe.it");
  await expect(dialog.getByLabel("Oggetto")).toHaveValue(/Master Services Agreement/);
  await expect(dialog.getByRole("checkbox", { name: "PDF", exact: true })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Word/ })).not.toBeChecked();
  await dialog.getByRole("checkbox", { name: "PDF", exact: true }).uncheck();
  await dialog.getByRole("button", { name: "Invia ora" }).click();
  await expect(page.getByText("Scegli almeno un formato da allegare.")).toBeVisible();
});

// ---- Editor PDF (PDF di prova generato dal server di prova) ----

async function openPdfEditor(page: import("@playwright/test").Page) {
  await page.goto("/c/fixture/pdf-editor");
  const sheet = page.getByTestId("pdf-page");
  await expect(sheet).toBeVisible();
  // Aspetta che pdf.js abbia davvero disegnato la pagina (il canvas non e' piu' tutto bianco).
  await expect
    .poll(async () => page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>("[data-testid=pdf-page] canvas");
      if (!c) return false;
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 4 * 97) if (d[i] < 200) return true;
      return false;
    }), { timeout: 15000 })
    .toBe(true);
  return sheet;
}
const saved = async (page: import("@playwright/test").Page) => JSON.parse((await page.getByTestId("saved").textContent()) || "[]") as { page: number; x: number; y: number; text: string; size: number; color: string; bold: boolean }[];

test("editor PDF: mostra la pagina, nessuna violazione WCAG, nessuno scorrimento orizzontale", async ({ page }) => {
  await openPdfEditor(page);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test("editor PDF: un clic aggiunge un testo nel punto giusto e il salvataggio lo restituisce in coordinate relative", async ({ page }) => {
  const sheet = await openPdfEditor(page);
  const box = (await sheet.boundingBox())!;
  await sheet.click({ position: { x: box.width * 0.4, y: box.height * 0.5 } });
  const note = page.getByRole("textbox", { name: "Testo sulla pagina 1" });
  await expect(note).toBeFocused();
  await note.fill("Mario Rossi");
  await expect(page.getByText("Modifiche non salvate")).toBeVisible();
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Modifiche non salvate")).toHaveCount(0);
  const [a] = await saved(page);
  expect(a).toMatchObject({ page: 0, text: "Mario Rossi", size: 12, color: "black", bold: false });
  expect(a.x).toBeCloseTo(0.4, 1);
  expect(a.y).toBeCloseTo(0.5, 1);
});

test("editor PDF: la maniglia sposta il testo col mouse e con le frecce, Canc lo elimina", async ({ page, isMobile }) => {
  test.skip(isMobile, "il trascinamento con il mouse si prova su desktop");
  const sheet = await openPdfEditor(page);
  const box = (await sheet.boundingBox())!;
  await page.getByRole("button", { name: "Aggiungi testo" }).click();
  const handle = page.getByRole("button", { name: /Sposta il testo/ });
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + box.width * 0.3, h.y + h.height / 2 + box.height * 0.2, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Salva" }).click();
  let [a] = await saved(page);
  expect(a.x).toBeCloseTo(0.4, 1); // 0,1 + 0,3
  expect(a.y).toBeCloseTo(0.3, 1); // 0,1 + 0,2

  await handle.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Salva" }).click();
  [a] = await saved(page);
  expect(a.x).toBeCloseTo(0.415, 2);

  await handle.focus();
  await page.keyboard.press("Delete");
  await expect(page.getByRole("textbox", { name: "Testo sulla pagina 1" })).toHaveCount(0);
});

test("editor PDF: corpo, colore e grassetto del testo selezionato; testi rapidi; pagina successiva", async ({ page }) => {
  await openPdfEditor(page);
  await page.getByRole("button", { name: "Data di oggi" }).click();
  await expect(page.getByRole("textbox", { name: "Testo sulla pagina 1" })).toHaveValue("12/11/2026");
  await page.getByLabel("Dimensione del testo").selectOption("24");
  await page.getByLabel("Colore del testo").selectOption("red");
  await page.getByRole("button", { name: "Grassetto" }).click();
  await expect(page.getByRole("button", { name: "Grassetto" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Successiva" }).click();
  await expect(page.getByText("Pagina 2 di 2")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Testo sulla pagina 1" })).toHaveCount(0);
  await page.getByRole("button", { name: "Nome cliente" }).click();
  await expect(page.getByRole("textbox", { name: "Testo sulla pagina 2" })).toHaveValue("Caffè Rosso Srl");

  // L'elenco dei testi inseriti porta alla pagina giusta.
  await expect(page.getByText("Testi inseriti (2)")).toBeVisible();
  await page.getByRole("button", { name: /p\.1.*12\/11\/2026/ }).click();
  await expect(page.getByText("Pagina 1 di 2")).toBeVisible();
  await page.getByRole("button", { name: /p\.2.*Caffè Rosso Srl/ }).click();
  await expect(page.getByText("Pagina 2 di 2")).toBeVisible();

  await page.getByRole("button", { name: "Salva" }).click();
  const all = await saved(page);
  expect(all).toHaveLength(2);
  expect(all.find((n) => n.page === 0)).toMatchObject({ text: "12/11/2026", size: 24, color: "red", bold: true });
  expect(all.find((n) => n.page === 1)).toMatchObject({ text: "Caffè Rosso Srl" });
});

test("editor PDF: l'invio e' solo PDF (nessuna scelta del Word)", async ({ page }) => {
  await openPdfEditor(page);
  await page.getByRole("button", { name: "Invia al cliente" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Destinatario")).toHaveValue("mario@caffe.it");
  await expect(dialog.getByText("In allegato: il PDF con i testi che hai aggiunto.")).toBeVisible();
  // Nessuna scelta di formato: restano "firma e timbro" (attiva) e "chiedi la firma del cliente" (spenta).
  await expect(dialog.getByRole("checkbox")).toHaveCount(2);
  await expect(dialog.getByRole("checkbox", { name: /firmare il PDF/ })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /firma e timbro/i })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Word/ })).toHaveCount(0);
});

test("panoramica: 8 indicatori su una sola riga, «Incassato» il piu' grande, niente testo tagliato", async ({ page, isMobile }) => {
  test.skip(isMobile, "su telefono le schede vanno a capo per scelta");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/c/fixture/kpi");
  const cards = page.getByRole("listitem");
  await expect(cards).toHaveCount(8);
  const boxes = await cards.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), w: r.width, sw: e.scrollWidth, cw: e.clientWidth }; }));
  expect(new Set(boxes.map((b) => b.top)).size).toBe(1); // stessa riga
  expect(boxes[0].w).toBe(Math.max(...boxes.map((b) => b.w))); // la prima e' la piu' larga
  expect(boxes.every((b) => b.sw <= b.cw + 1)).toBe(true); // nessun contenuto che esce dalla scheda
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
