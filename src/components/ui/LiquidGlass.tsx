"use client";

import { createElement, useEffect, type CSSProperties, type ReactNode } from "react";

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
}) {
  useEffect(() => {
    void loadLiquidGlass();
  }, []);
  return createElement(
    "liquid-glass",
    { id, class: className, style, backdrop, colors, dim: String(dim) },
    children
  );
}
