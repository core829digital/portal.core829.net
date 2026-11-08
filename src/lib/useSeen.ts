"use client";

import { useInView } from "@/lib/useInView";

/**
 * Per i blocchi con animazioni (grafici, barre): restituisce il riferimento da mettere sul blocco e l'attributo
 * `data-seen`. Il CSS tiene in pausa le animazioni finche' il blocco non entra nello schermo, cosi' non si
 * consumano "fuori vista" (e chi scorre le vede partire al momento giusto).
 */
export function useSeen<T extends Element>() {
  const [ref, seen] = useInView<T>("-8% 0px");
  return { ref, "data-seen": seen ? "true" : "false" } as const;
}
