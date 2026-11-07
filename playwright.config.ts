import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;

/**
 * Prove nel browser vero, contro la versione di PRODUZIONE (`next start`), senza backend: servono a
 * verificare pagine, sicurezza e accessibilita' che non dipendono dai dati.
 *
 * - In CI girano tutti i browser (Chromium, Firefox, WebKit/Safari) piu' telefono Android e iPhone.
 * - In locale, se i browser di Playwright non sono installati, si puo' usare un Chromium esistente:
 *     PW_CHROMIUM_PATH=/percorso/chromium npx playwright test --project=chromium
 * La build va fatta PRIMA con le variabili d'ambiente di prova (vedi .github/workflows/ci.yml).
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const chromiumLaunch = executablePath ? { launchOptions: { executablePath, args: ["--no-sandbox"] } } : {};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: BASE, trace: "off" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...chromiumLaunch } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "android", use: { ...devices["Pixel 7"], ...chromiumLaunch } },
    { name: "iphone", use: { ...devices["iPhone 14"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${BASE}/robots.txt`,
    // Mai riusare un server gia' acceso: si rischierebbe di provare una versione vecchia senza accorgersene.
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NEXT_PUBLIC_CONVEX_URL: "https://e2e-test.convex.cloud",
      NEXT_PUBLIC_APP_URL: BASE,
      // Attiva la pagina di prova con dati inventati (/c/fixture). In produzione NON va impostata.
      E2E_FIXTURES: "1",
    },
  },
});
