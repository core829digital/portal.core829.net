"use client";

import { createElement, useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Liquid glass CORE829 — struttura identica alla guida ufficiale (github.com/MuhammadaliMS/liquid-glass):
 *
 *   <liquid-glass backdrop="aurora" colors="…" dim=".15" style="height: 100vh">
 *     <nav glass class="navbar">…</nav>
 *     <a glass href="/signup" class="button">Get started</a>
 *   </liquid-glass>
 *
 * 1. <GlassScene> = <liquid-glass>: avvolge una sezione e ne disegna lo sfondo (aurora nei colori del brand).
 * 2. Ogni discendente con l'attributo `glass` (da spargere con {...GLASS}) diventa vetro tracciato a raggi
 *    che rifrange lo sfondo della scena: massimo 16 per scena.
 * 3. Lo sfondo proprio degli elementi `glass` resta trasparente (regola in globals.css, attiva quando WebGL è pronto);
 *    la tinta si imposta con la variabile CSS --glass-tint.
 * La libreria (MIT) è inclusa nel bundle (lib/vendor): nessuna richiesta esterna, compatibile con la CSP.
 * Senza WebGL la libreria ricade su un vetro smerigliato in CSS; con "riduci animazioni" tiene tutto fermo.
 */

export { GLASS, NO_GLASS, AURORA_DARK, AURORA_LIGHT } from "@/lib/glass";
import { AURORA_DARK } from "@/lib/glass";

let loading: Promise<unknown> | null = null;
/** Registra il custom element <liquid-glass> (solo lato client, una volta). */
export function loadLiquidGlass() {
  if (typeof window === "undefined") return Promise.resolve();
  loading ??= import("@/lib/vendor/liquid-glass").catch(() => {
    loading = null; // un errore di rete non deve disattivare il vetro per sempre
  });
  return loading;
}

export function GlassScene({
  children,
  className,
  style,
  colors = AURORA_DARK,
  dim = 0,
  backdrop = "aurora",
  id,
  source,
  fixedLight = true,
  lazy = true,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Fino a quattro colori CSS per l'aurora. */
  colors?: string;
  /** 0–0.9: scurisce lo sfondo per tenere il testo leggibile. */
  dim?: number;
  /** "aurora" (animato) oppure URL di un'immagine/video. */
  backdrop?: string;
  id?: string;
  /**
   * Estensione CORE829: canvas/video live usato come sfondo al posto di `backdrop` (resta interattivo).
   * Il resto è HTML identico alla guida ufficiale.
   */
  source?: HTMLCanvasElement | HTMLVideoElement | null;
  /** Il riflesso del vetro resta fermo (nessun "punto di luce" che segue il mouse). Default true. */
  fixedLight?: boolean;
  /** Il contesto WebGL esiste solo con la scena vicina al viewport (default true). */
  lazy?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    void loadLiquidGlass();
  }, []);
  // La proprietà `source` esiste solo dopo che il custom element è definito (assegnarla prima la oscurerebbe).
  useEffect(() => {
    let cancelled = false;
    void loadLiquidGlass().then(() => customElements.whenDefined("liquid-glass")).then(() => {
      const el = ref.current as (HTMLElement & { source?: unknown }) | null;
      if (!cancelled && el) el.source = source ?? null;
    });
    return () => {
      cancelled = true;
    };
  }, [source]);
  return createElement(
    "liquid-glass",
    { ref, id, class: className, style, backdrop, colors, dim: String(dim), ...(fixedLight ? { "fixed-light": "" } : {}), ...(lazy ? { lazy: "" } : {}) },
    children
  );
}
