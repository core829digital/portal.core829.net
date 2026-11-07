import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Un token dalla forma giusta (43 caratteri base64url). Non corrisponde a nessun link vero.
const TOKEN = "a".repeat(20) + "B".repeat(20) + "_-9";

/** Raccoglie le violazioni della Content-Security-Policy segnalate dal browser. */
function watchCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/content security policy|violates the following|refused to/i.test(m.text())) violations.push(m.text().slice(0, 200));
  });
  return violations;
}

test.describe("pagine pubbliche", () => {
  test("home: ben disegnata, nessuna violazione di sicurezza", async ({ page }) => {
    const csp = watchCsp(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Portale clienti" })).toBeVisible();
    const font = await page.locator("h1").evaluate((el) => getComputedStyle(el).fontFamily);
    expect(font, "deve usare il font Geist, non quello di sistema").toContain("Geist");
    expect(csp).toEqual([]);
  });

  test("/c senza link: invita ad aprire il link personale", async ({ page }) => {
    await page.goto("/c");
    await expect(page.getByRole("heading", { name: "Apri il tuo link personale" })).toBeVisible();
  });

  test("/c con link: il segreto viene tolto dall'indirizzo e tenuto solo nella scheda", async ({ page }) => {
    const csp = watchCsp(page);
    await page.goto(`/c#${TOKEN}`);
    await expect(page.getByLabel("Caricamento")).toBeVisible();
    expect(page.url()).not.toContain(TOKEN);
    expect(new URL(page.url()).hash).toBe("");
    expect(await page.evaluate(() => sessionStorage.getItem("portal-link"))).toBe(TOKEN);
    expect(await page.evaluate(() => localStorage.length), "mai in localStorage").toBe(0);
    expect(await page.evaluate(() => document.cookie), "mai nei cookie").toBe("");
    // Un aggiornamento della pagina non obbliga a riaprire il link.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Apri il tuo link personale" })).toHaveCount(0);
    expect(csp).toEqual([]);
  });

  test("/c con un frammento non valido non viene mai preso per un token", async ({ page }) => {
    await page.goto("/c#<script>alert(1)</script>");
    await expect(page.getByRole("heading", { name: "Apri il tuo link personale" })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("portal-link"))).toBeNull();
  });

  test("pagina inesistente: messaggio generico, senza dettagli tecnici", async ({ page }) => {
    const response = await page.goto("/questa-pagina-non-esiste");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Pagina non trovata" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/stack|next\.js|error:/i);
  });
});

test.describe("area amministratore (non autenticato)", () => {
  test("/admin porta al login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole("heading", { name: "Accesso amministratore" })).toBeVisible();
  });

  test("una pagina cliente dell'admin porta al login", async ({ page }) => {
    await page.goto("/admin/clients/abcdefghijklmnopqrstuvwxyz123456");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("il modulo di accesso e' accessibile e valida l'email prima di inviare qualunque cosa", async ({ page }) => {
    let requests = 0;
    page.on("request", (r) => {
      if (r.url().includes("convex")) requests++;
    });
    await page.goto("/admin/login");
    const email = page.getByLabel("Email");
    await expect(email).toBeVisible();
    await email.fill("non-una-email");
    await page.getByRole("button", { name: "Invia il codice" }).click();
    const error = page.getByText("Inserisci un indirizzo email valido.");
    await expect(error).toBeVisible();
    // Il messaggio e' annunciato dagli screen reader (role=alert).
    await expect(error).toHaveAttribute("role", "alert");
    expect(requests, "nessuna richiesta al server con un'email non valida").toBe(0);
  });
});

test.describe("intestazioni di sicurezza", () => {
  test("ogni risposta porta le difese di base", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["x-robots-tag"]).toContain("noindex");
    expect(h["x-powered-by"], "non si rivela lo stack").toBeUndefined();
    const csp = h["content-security-policy"];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  });

  test("il nonce della CSP cambia a ogni richiesta", async ({ request }) => {
    const nonce = async () => /'nonce-([^']+)'/.exec((await request.get("/")).headers()["content-security-policy"])?.[1];
    const a = await nonce();
    const b = await nonce();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  test("le pagine del cliente non si mettono mai in cache", async ({ request }) => {
    const cache = (await request.get("/c")).headers()["cache-control"];
    expect(cache).toContain("no-store");
  });

  test("metodi non ammessi respinti; robots vieta l'indicizzazione", async ({ request }) => {
    expect((await request.fetch("/", { method: "PUT" })).status()).toBe(405);
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /");
  });
});

test.describe("adattamento allo schermo", () => {
  for (const path of ["/", "/c", "/admin/login"]) {
    test(`${path}: nessuno scorrimento orizzontale`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("load");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
    });
  }
});

test.describe("accessibilita' (WCAG 2 A e AA)", () => {
  for (const [name, path] of [["home", "/"], ["spazio cliente senza link", "/c"], ["login amministratore", "/admin/login"]] as const) {
    test(`${name}: nessuna violazione`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("load");
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    });
  }
});
