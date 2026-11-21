"use client";

import { createElement, useEffect, type CSSProperties, type ReactNode } from "react";

/**
 * Liquid glass CORE829 — funzione globale.
 *
 * <GlassScene> avvolge una zona del sito (la libreria "liquid-glass", MIT, è inclusa nel bundle:
 * nessuna richiesta esterna, compatibile con la CSP). Dentro la scena, ogni elemento con `{...GLASS}`
 * diventa vetro tracciato a raggi che rifrange lo sfondo della scena (colori del brand).
 *
 * Regole:
 *  - il vetro rifrange solo lo sfondo della propria scena, non la pagina: usarlo su pulsanti e
 *    controlli principali (hero, CTA), non su interi blocchi di testo;
 *  - senza WebGL, con "riduci animazioni" o prima del caricamento il contenuto resta HTML normale
 *    (la libreria ricade su un vetro smerigliato in CSS): nessuna funzione dipende dal vetro;
 *  - massimo 16 elementi vetro per scena.
 */

/** Attributo che rende un elemento vetro (da spargere sull'elemento: `<a {...GLASS}>`). */
export const GLASS = { glass: "" } as Record<string, string>;

/** Colori dell'aurora: sfumature di Rosso Racing (il testo Nero Pista resta leggibile ovunque, ≥4,9:1). */
export const BRAND_AURORA = "#ff2743 #ff4d63 #ff2743 #ff6e80";

let loading: Promise<unknown> | null = null;
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
  colors = BRAND_AURORA,
  dim = 0,
  backdrop = "aurora",
  disabled = false,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  colors?: string;
  dim?: number;
  backdrop?: string;
  /** true = nessun vetro (es. "versione semplice"): i figli restano elementi normali. */
  disabled?: boolean;
}) {
  useEffect(() => {
    if (!disabled) void loadLiquidGlass();
  }, [disabled]);

  if (disabled) return <div className={className} style={style}>{children}</div>;
  return createElement(
    "liquid-glass",
    { class: `glass-scene ${className ?? ""}`.trim(), style, backdrop, colors, dim: String(dim) },
    children
  );
}
