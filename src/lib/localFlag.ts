"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "portal-flag-change";

/** Un'impostazione "gia' fatto" salvata nel browser (es. "ho letto l'introduzione"). */
export function useLocalFlag(key: string): [boolean, () => void] {
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener(EVENT, callback);
    window.addEventListener("storage", callback);
    return () => {
      window.removeEventListener(EVENT, callback);
      window.removeEventListener("storage", callback);
    };
  }, []);
  const read = useCallback(() => {
    try {
      return window.localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }, [key]);
  // Sul server si assume "non ancora fatto": la scheda esiste gia' nell'HTML. Per chi l'ha gia' chiusa la nasconde
  // uno script eseguito prima del disegno (vedi onboardingFlag.ts), quindi non c'e' lampeggio ne' salto.
  const value = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback(() => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Storage non disponibile: la scheda si nascondera' solo per questa visita.
    }
    window.dispatchEvent(new Event(EVENT));
  }, [key]);
  return [value, set];
}
