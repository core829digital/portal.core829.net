"use client";

import { createContext, useContext } from "react";
import type { PortalData } from "@/components/portal/PortalPage";

export type PortalContextValue = {
  data: PortalData;
  /** Segreto del link (solo in memoria della scheda). Serve ai download dei documenti. */
  token: string;
  /** Prefisso degli indirizzi delle pagine: "/c" in produzione, "/c/fixture" nelle prove. */
  base: string;
};

const PortalContext = createContext<PortalContextValue | null>(null);

export const PortalContextProvider = PortalContext.Provider;

export function usePortal(): PortalContextValue {
  const value = useContext(PortalContext);
  if (!value) throw new Error("usePortal va usato dentro PortalChrome.");
  return value;
}
