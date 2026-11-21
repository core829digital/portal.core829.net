"use client";

import { useEffect } from "react";

/**
 * Liquid glass CORE829 — funzione globale (libreria "liquid-glass", MIT, inclusa nel bundle: nessuna
 * richiesta esterna, compatibile con la CSP).
 *
 * <GlassEnhancer selector="…" /> va montato UNA volta nel layout di ogni sito. Trasforma in vetro tracciato a
 * raggi tutti gli elementi che corrispondono al selettore (pulsanti, barre, pannelli), in tutto il sito:
 *  - il colore del vetro è ricavato dal colore reale dell'elemento (Rosso Racing, Bianco Polare, Nero Pista…),
 *    quindi ogni variante conserva la propria identità e il testo resta leggibile;
 *  - ogni elemento riceve un proprio sfondo "aurora" dietro di sé (la libreria rifrange solo il proprio sfondo,
 *    non la pagina) e il vetro viene attivato solo quando l'elemento è visibile (massimo 8 contesti WebGL, 4 su
 *    telefono, ridotti se il browser ne concede meno), poi rimosso: nessun limite di elementi per pagina;
 *  - gli elementi sono HTML normali: senza WebGL, con "riduci trasparenza", "contrasto più alto" o `disabled`
 *    restano com'erano. Con "riduci animazioni" la libreria tiene il vetro fermo.
 * Opt-in singolo: attributo `data-glass`. Opt-out: `data-no-glass` sull'elemento o su un suo antenato.
 */

let loading: Promise<unknown> | null = null;
export function loadLiquidGlass() {
  if (typeof window === "undefined") return Promise.resolve();
  loading ??= import("@/lib/vendor/liquid-glass").catch(() => {
    loading = null; // un errore di rete non deve disattivare il vetro per sempre
  });
  return loading;
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

let probe: CanvasRenderingContext2D | null = null;
/** Qualsiasi colore CSS (rgb, oklch, color-mix…) → [r, g, b, a]. */
function toRgba(css: string): [number, number, number, number] | null {
  if (!probe) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    probe = c.getContext("2d", { willReadFrequently: true });
  }
  if (!probe) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000";
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], d[3] / 255];
}

/** Colore reale visto dietro il contenuto: sfondo dell'elemento composto sopra quelli degli antenati. */
function effectiveColor(el: Element): number[] {
  let r = 0, g = 0, b = 0, acc = 0;
  for (let n: Element | null = el; n && acc < 0.99; n = n.parentElement) {
    const c = toRgba(getComputedStyle(n).backgroundColor);
    if (!c || c[3] === 0) continue;
    const w = c[3] * (1 - acc);
    r += c[0] * w; g += c[1] * w; b += c[2] * w; acc += w;
  }
  const w = 1 - acc; // fondo pagina (bianco) se nessun antenato è opaco
  return [r + 255 * w, g + 255 * w, b + 255 * w];
}

function isPinned(el: HTMLElement) {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const p = getComputedStyle(n).position;
    if (p === "fixed" || p === "sticky") return true;
  }
  return false;
}

/**
 * Il vetro rifrange solo lo sfondo della propria scena (limite del WebGL: non può leggere la pagina). Per ottenere un
 * vetro davvero traslucido, lo sfondo della scena è un'istantanea di ciò che sta DIETRO l'elemento: i colori degli
 * antenati più canvas/immagini/video che lo precedono e lo attraversano.
 */
function snapshotBehind(el: HTMLElement): { url: string; avg: number[] } | null {
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const k = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = Math.max(2, Math.round(rect.width * k));
  const h = Math.max(2, Math.round(rect.height * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");
  if (!x) return null;
  const paint = (withMedia: boolean) => {
    x.globalAlpha = 1;
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, w, h);
    const chain: Element[] = [];
    for (let n = el.parentElement; n; n = n.parentElement) chain.unshift(n);
    for (const n of chain) {
      const col = toRgba(getComputedStyle(n).backgroundColor);
      if (col && col[3] > 0) {
        x.globalAlpha = col[3];
        x.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
        x.fillRect(0, 0, w, h);
      }
    }
    x.globalAlpha = 1;
    if (!withMedia) return;
    const pinned = isPinned(el); // un elemento fisso sta sopra tutto il contenuto: tutto ciò che lo attraversa è "dietro"
    document.querySelectorAll<HTMLElement>("canvas, img, video").forEach((m) => {
      if (m === el || el.contains(m) || m.contains(el) || m.classList.contains(LAYER) || m.closest(`.${LAYER}`)) return;
      if (!pinned && !(m.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) return; // solo ciò che sta sotto (prima nel DOM)
      const r = m.getBoundingClientRect();
      if (r.right <= rect.left || r.left >= rect.right || r.bottom <= rect.top || r.top >= rect.bottom || r.width < 2) return;
      let op = 1;
      for (let n: HTMLElement | null = m; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        op *= parseFloat(cs.opacity) || 0;
        if (cs.visibility === "hidden" || cs.display === "none") op = 0;
      }
      if (op < 0.04) return;
      x.globalAlpha = op;
      try {
        x.drawImage(m as CanvasImageSource, (r.left - rect.left) * k, (r.top - rect.top) * k, r.width * k, r.height * k);
      } catch {
        /* sorgente non leggibile */
      }
    });
    x.globalAlpha = 1;
  };
  const finish = () => {
    const url = c.toDataURL("image/png"); // lancia se un'immagine esterna ha "sporcato" il canvas
    const m = document.createElement("canvas");
    m.width = m.height = 1;
    const mx = m.getContext("2d", { willReadFrequently: true });
    let avg = [255, 255, 255];
    if (mx) {
      mx.drawImage(c, 0, 0, 1, 1);
      const d = mx.getImageData(0, 0, 1, 1).data;
      avg = [d[0], d[1], d[2]];
    }
    return { url, avg };
  };
  try {
    paint(true);
    return finish();
  } catch {
    paint(false);
    return finish();
  }
}

const relLum = (c: number[]) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const contrast = (a: number[], b: number[]) => {
  const x = relLum(a), y = relLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const LAYER = "glass-layer";

export function GlassEnhancer({ selector, disabled = false }: { selector: string; disabled?: boolean }) {
  useEffect(() => {
    if (disabled || typeof window === "undefined") return;
    const mq = (q: string) => window.matchMedia(q).matches;
    if (mq("(prefers-reduced-transparency: reduce)") || mq("(prefers-contrast: more)") || !hasWebGL()) return;

    let max = mq("(max-width: 640px)") ? 4 : 8;
    const full = `${selector}, [data-glass]`;
    const live = new Map<HTMLElement, { layer: HTMLElement; pos: string; obs: MutationObserver }>();
    const visible = new Set<HTMLElement>();
    const seen = new WeakSet<Element>();
    let cancelled = false;
    let io: IntersectionObserver | null = null;
    let mo: MutationObserver | null = null;
    let raf = 0;

    const eligible = (el: HTMLElement) =>
      el.isConnected &&
      !/^(INPUT|SELECT|TEXTAREA|OPTION)$/.test(el.tagName) &&
      !el.closest("[data-no-glass]") &&
      !(el as HTMLButtonElement).disabled &&
      el.getAttribute("aria-disabled") !== "true" &&
      el.offsetWidth >= 28 &&
      el.offsetHeight >= 28;

    // Il browser non concede più contesti WebGL di quelli già attivi: si fissa il tetto e l'elemento torna normale.
    const demote = (el: HTMLElement) => {
      let ok = 0;
      for (const v of live.values()) if (v.layer.dataset.renderer !== "css") ok++;
      max = Math.max(1, ok);
      detach(el);
    };

    const attach = (el: HTMLElement) => {
      if (live.has(el) || live.size >= max || !eligible(el)) return;
      // I pulsanti hanno `transition: all`: si leggono i colori finali, non quelli intermedi di una transizione in corso.
      const prevTransition = el.style.transition;
      el.style.transition = "none";
      const cs = getComputedStyle(el);
      const own = toRgba(cs.backgroundColor);
      const textNow = toRgba(cs.color) ?? [0, 0, 0, 1];
      const posNow = cs.position;
      el.style.transition = prevTransition;
      if (!own || own[3] < 0.03) return; // senza sfondo (es. ghost, contenitori trasparenti): niente vetro
      if (el.offsetWidth * el.offsetHeight > innerWidth * innerHeight * 0.5) return; // niente vetro su aree gigantesche
      const rgb = own[3] >= 0.3 ? own : [...effectiveColor(el), 1]; // molto trasparente: colore composto sugli antenati
      const snap = snapshotBehind(el);
      const url = snap?.url ?? null;
      const layer = document.createElement("liquid-glass");
      layer.className = LAYER;
      layer.setAttribute("aria-hidden", "true");
      layer.setAttribute("backdrop", url ?? "aurora");
      layer.setAttribute("dim", "0");
      if (url) layer.style.setProperty("--image", `url(${url})`);
      const face = document.createElement("span");
      face.setAttribute("glass", "");
      // Tinta: la più trasparente che mantiene il testo a ≥4,5:1 sopra ciò che sta dietro (istantanea).
      const text = textNow;
      const identity = own[3] >= 0.97 && el.matches('button, a, [role="button"], .btn, [class*="btn"]');
      const avg = snap?.avg ?? [255, 255, 255];
      let tint = 0.97;
      const l = relLum(rgb);
      for (const t of identity ? [0.98] : l > 0.55 ? [0.9, 0.97] : l < 0.06 ? [0.82, 0.92] : [0.45, 0.6, 0.75, 0.88]) {
        const blend = [0, 1, 2].map((i) => avg[i] * (1 - t) + rgb[i] * t);
        if (contrast(text, blend) >= 4.6) {
          tint = t;
          break;
        }
      }
      const frost = identity ? 0.15 : 0.2;
      face.style.cssText = `position:absolute;inset:0;border-radius:inherit;background:transparent;--glass-tint:rgba(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])},${tint});--glass-frost:${frost};--glass-shadow:.25;--glass-pull:0`;
      layer.appendChild(face);
      const pos = el.style.position;
      if (posNow === "static") el.style.position = "relative";
      el.insertBefore(layer, el.firstChild);
      // Perdita di contesto WebGL o passaggio al vetro CSS: l'elemento torna subito normale (niente sfondo "vuoto").
      const obs = new MutationObserver(() => {
        if (layer.dataset.renderer === "css") demote(el);
      });
      obs.observe(layer, { attributes: true, attributeFilter: ["data-renderer"] });
      live.set(el, { layer, pos, obs });
      // Se il browser non concede più contesti WebGL, la libreria ricadrebbe su un vetro CSS: meglio lasciare l'elemento
      // normale e non superare più quel numero di scene.
      // Il vetro sostituisce lo sfondo dell'elemento solo quando WebGL è pronto e ha disegnato il primo fotogramma;
      // se non lo diventa entro 3 s (o passa al vetro CSS) l'elemento resta com'era.
      let waited = 0;
      const poll = window.setInterval(() => {
        const s = live.get(el);
        if (!s || s.layer !== layer) return clearInterval(poll);
        waited += 100;
        if (layer.dataset.renderer === "css" || waited > 3000) {
          clearInterval(poll);
          demote(el);
        } else if (layer.dataset.renderer === "webgl" && "ready" in layer.dataset) {
          clearInterval(poll);
          el.classList.add("glass-on");
        }
      }, 100);
      window.setTimeout(() => live.has(el) && resample(el), 900); // font, immagini e canvas hanno finito di caricare
    };

    const detach = (el: HTMLElement) => {
      const s = live.get(el);
      if (!s) return;
      s.obs.disconnect();
      s.layer.remove();
      el.classList.remove("glass-on");
      el.style.position = s.pos;
      live.delete(el);
      for (const v of visible) {
        if (live.size >= max) break;
        attach(v);
      }
    };

    // Elementi fissi/sticky (barra di navigazione): lo sfondo cambia mentre si scorre, quindi si ricampiona.
    const resample = (el: HTMLElement) => {
      const s = live.get(el);
      if (!s) return;
      const snap = snapshotBehind(el);
      const url = snap?.url;
      if (url) {
        s.layer.style.setProperty("--image", `url(${url})`);
        s.layer.setAttribute("backdrop", url);
      }
    };
    let tick = 0;
    const onScroll = () => {
      if (tick) return;
      tick = window.setTimeout(() => {
        tick = 0;
        for (const el of live.keys()) if (isPinned(el)) resample(el);
      }, 160);
    };
    const onResize = () => {
      for (const el of live.keys()) resample(el);
    };
    // Se il browser perde un contesto WebGL (limite di sistema), la libreria passa al vetro CSS: si torna all'elemento normale.
    const watchdog = window.setInterval(() => {
      for (const [el, v] of [...live]) if (v.layer.dataset.renderer === "css") demote(el);
    }, 1500);
    // Cambio di tema (es. tunnel scuro attivo/disattivo): colori e tinte vanno ricalcolati.
    const themeObs = new MutationObserver(() => {
      for (const el of [...live.keys()]) detach(el);
      for (const v of visible) attach(v);
    });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tunnel", "class"] });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    const watch = (el: HTMLElement) => {
      if (seen.has(el)) return;
      seen.add(el);
      io?.observe(el);
    };
    const scan = () => {
      raf = 0;
      document.querySelectorAll<HTMLElement>(full).forEach(watch);
    };

    loadLiquidGlass().then(() => {
      if (cancelled) return;
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const el = e.target as HTMLElement;
            if (e.isIntersecting) {
              visible.add(el);
              attach(el);
            } else {
              visible.delete(el);
              detach(el);
            }
          }
        },
        { rootMargin: "120px" }
      );
      scan();
      mo = new MutationObserver((muts) => {
        // ignora le mutazioni causate dal vetro stesso
        if (muts.every((m) => [...m.addedNodes, ...m.removedNodes].every((n) => (n as HTMLElement).classList?.contains(LAYER)))) return;
        if (!raf) raf = requestAnimationFrame(scan);
      });
      mo.observe(document.body, { childList: true, subtree: true });
    });

    return () => {
      cancelled = true;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (tick) clearTimeout(tick);
      clearInterval(watchdog);
      themeObs.disconnect();
      if (raf) cancelAnimationFrame(raf);
      mo?.disconnect();
      io?.disconnect();
      for (const el of [...live.keys()]) detach(el);
      visible.clear();
    };
  }, [selector, disabled]);

  return null;
}
