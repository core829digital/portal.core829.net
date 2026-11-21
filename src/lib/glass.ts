/** Costanti del liquid glass: modulo senza "use client", importabile anche dai server component. */

/** Attributo che rende un elemento vetro: `<a {...GLASS}>`. */
export const GLASS = { glass: "" } as Record<string, string>;
export const NO_GLASS = {} as Record<string, string>;

/** Colori dell'aurora nel brand CORE829: Rosso Racing su Nero Pista (scuro) e Bianco Polare con rosato (chiaro). */
export const AURORA_DARK = "#c4182f #141416 #141416 #5a0e1a";
export const AURORA_LIGHT = "#f8f8f8 #fff0f2 #ffffff #ffe3e8";
