import { expect, test, type Page } from "@playwright/test";

/**
 * Controllo geometrico di omogeneita' sulle pagine di prova (stesse pagine che l'utente vede, con dati inventati).
 * Trova cio' che l'occhio nota subito:
 *  - titoli o blocchi con bordo/ombra a contatto con quello sopra (spazio < 8 px),
 *  - campi di un modulo incollati tra loro,
 *  - parole attaccate nei titoli,
 *  - testo che esce dal proprio riquadro.
 */
const PAGES = [
  "/c/fixture",
  "/c/fixture/projects",
  "/c/fixture/billing",
  "/c/fixture/subscriptions",
  "/c/fixture/documents",
  "/c/fixture/reports",
  "/c/fixture/site",
  "/c/fixture/sign",
  "/c/fixture/previews",
  "/c/fixture/kpi",
  "/c/fixture/support",
  "/c/fixture/approval",
  "/c/fixture/reminders",
] as const;

async function audit(page: Page) {
  return await page.evaluate(() => {
    const out: string[] = [];
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 4 && r.height > 4 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[aria-hidden='true'] .sr-only") && !(el as HTMLElement).classList.contains("sr-only");
    };
    const boxed = (el: Element) => {
      const cs = getComputedStyle(el);
      return cs.boxShadow !== "none" || parseFloat(cs.borderTopWidth) > 0 || (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent");
    };
    // Un blocco ha un "bordo visibile" se lo ha lui o il suo primo/ultimo figlio (es. griglia di schede).
    const edged = (el: Element) => boxed(el) || (el.firstElementChild ? boxed(el.firstElementChild) : false) || (el.lastElementChild ? boxed(el.lastElementChild) : false);
    const label = (el: Element) => `${el.tagName.toLowerCase()}${(el as HTMLElement).className && typeof (el as HTMLElement).className === "string" ? "." + (el as HTMLElement).className.split(" ").slice(0, 2).join(".") : ""} "${(el.textContent ?? "").trim().slice(0, 24)}"`;
    const main = document.querySelector("main") ?? document.body;
    for (const parent of main.querySelectorAll("*")) {
      const cs = getComputedStyle(parent);
      if (cs.display === "flex" && cs.flexDirection.startsWith("row") && cs.flexWrap === "nowrap") continue;
      if (cs.display === "grid") continue; // lo spazio e' deciso da `gap`
      if (parent.tagName === "TR" || parent.tagName === "TBODY" || parent.tagName === "THEAD" || parent.tagName === "TABLE" || parent.tagName === "UL" || parent.tagName === "OL" || parent.tagName === "SVG") continue;
      const kids = [...parent.children].filter(vis);
      for (let i = 1; i < kids.length; i++) {
        const a = kids[i - 1].getBoundingClientRect();
        const b = kids[i].getBoundingClientRect();
        const gap = b.top - a.bottom;
        if (gap < -1 || gap >= 8) continue; // sovrapposti di proposito o spaziati
        if (b.top < a.top + a.height * 0.5) continue; // affiancati
        const heading = /^H[1-4]$/.test(kids[i].tagName) || /^H[1-4]$/.test(kids[i - 1].tagName);
        const bothBoxed = edged(kids[i]) && edged(kids[i - 1]) && a.width > 120 && b.width > 120 && a.height > 24 && b.height > 24;
        if (heading && gap < 4 && a.height > 14 && /^H[1-4]$/.test(kids[i - 1].tagName) && !/^H[1-4]$/.test(kids[i].tagName) && gap < 1) out.push(`titolo a contatto con il contenuto: ${label(kids[i - 1])} → ${label(kids[i])} (${gap.toFixed(0)}px)`);
        if (bothBoxed) out.push(`blocchi incollati (${gap.toFixed(0)}px): ${label(kids[i - 1])} → ${label(kids[i])}`);
      }
    }
    // Parole attaccate nei titoli: il testo visibile non deve avere meno spazi di quello accessibile.
    for (const h of main.querySelectorAll("h1,h2,h3")) {
      const sr = h.querySelector(".sr-only")?.textContent?.trim();
      const shown = (h as HTMLElement).innerText.replace(/\s+/g, " ").trim();
      if (sr && !shown.includes(sr) && shown.replace(/ /g, "") !== sr.replace(/ /g, "") ) continue;
      if (/[a-zà-ù][A-ZÀ-Ù][a-zà-ù]/.test(shown) && !/[A-Z]{2}/.test(shown) && shown.split(" ").length === 1 && shown.length > 14) out.push(`parole attaccate? «${shown}»`);
    }
    // Testo che esce dal proprio riquadro.
    for (const el of main.querySelectorAll("p,span,h1,h2,h3,h4,li,dd,dt,label,button,a")) {
      const cs = getComputedStyle(el);
      if (!vis(el) || cs.overflow !== "visible" || cs.display === "inline") continue;
      if (el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== "ellipsis" && cs.whiteSpace !== "nowrap") out.push(`testo che esce dal riquadro: ${label(el)}`);
    }
    return [...new Set(out)];
  });
}

for (const path of PAGES) {
  test(`omogeneita' UI: ${path} senza blocchi incollati, titoli a contatto o testo che sborda`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(path);
    await page.waitForTimeout(1300); // fine delle entrate animate
    expect(await audit(page)).toEqual([]);
  });
}

for (const path of ["/c/fixture", "/c/fixture/billing", "/c/fixture/support"] as const) {
  test(`omogeneita' UI su telefono: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(path);
    await page.waitForTimeout(1300);
    expect(await audit(page)).toEqual([]);
  });
}
