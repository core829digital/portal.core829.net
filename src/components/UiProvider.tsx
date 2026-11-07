"use client";

import { CSPProvider } from "@base-ui/react/csp-provider";
import type { ReactNode } from "react";

/**
 * Passa il nonce della richiesta ai componenti di Base UI (dialog, tabs, ...) che inseriscono
 * elementi <style>: senza, la Content-Security-Policy li bloccherebbe.
 */
export function UiProvider({ nonce, children }: { nonce: string | undefined; children: ReactNode }) {
  return <CSPProvider nonce={nonce}>{children}</CSPProvider>;
}
