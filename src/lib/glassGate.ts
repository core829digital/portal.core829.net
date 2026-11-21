"use client";

import { createContext, useContext } from "react";
import { GLASS, NO_GLASS } from "@/lib/glass";

/**
 * Chi può essere vetro in questo momento. `null` = fuori dal tunnel (sempre vetro); nel tunnel vale `true` solo per
 * la slide attiva: una scena non supera mai i 16 elementi `glass` e le slide ferme non disegnano vetro.
 */
export const GlassGateContext = createContext<boolean | null>(null);

export function useGlassAttr(): Record<string, string> {
  return useContext(GlassGateContext) === false ? NO_GLASS : GLASS;
}
