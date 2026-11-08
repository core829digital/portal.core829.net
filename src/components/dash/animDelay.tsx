"use client";

import { createContext, useContext, type ReactNode } from "react";

const Ctx = createContext(0);

/** Ritardo (ms) con cui deve partire un'animazione interna (numero, anello) rispetto al montaggio della pagina. */
export function AnimDelay({ ms, children }: { ms: number; children: ReactNode }) {
  return <Ctx.Provider value={ms}>{children}</Ctx.Provider>;
}

export const useAnimDelay = () => useContext(Ctx);
