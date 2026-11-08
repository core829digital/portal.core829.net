"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useInView } from "@/lib/useInView";

const QUERY = "(prefers-reduced-motion: reduce)";
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

/** Curva "out-quart": parte veloce e si ferma dolcemente sul valore finale. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

/**
 * Numero che "sale" fino al valore finale (animazione del brand).
 *  - parte quando il numero entra nello schermo, non prima (niente animazione persa fuori vista);
 *  - se il valore cambia dal vivo, scorre dal numero mostrato a quello nuovo (non riparte da zero);
 *  - scrive direttamente nel testo, senza ridisegnare React a ogni fotogramma (fluido anche su telefoni lenti);
 *  - il valore corretto e' sempre presente per gli screen reader; con "riduci animazioni" si vede subito.
 */
export function CountUp({ value, format, durationMs = 1100, delayMs = 0 }: { value: number; format: (n: number) => string; durationMs?: number; delayMs?: number }) {
  const reduced = useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => true);
  const [boxRef, seen] = useInView<HTMLSpanElement>("0px");
  const textRef = useRef<HTMLSpanElement>(null);
  const shown = useRef(0); // ultimo numero mostrato
  const formatRef = useRef(format);

  useEffect(() => {
    formatRef.current = format;
  });

  useEffect(() => {
    const node = textRef.current;
    if (!node) return;
    if (reduced || !seen) {
      shown.current = reduced ? value : 0;
      if (reduced) node.textContent = formatRef.current(value);
      return;
    }
    const from = shown.current;
    // Cambi piccoli (es. un euro in piu') durano meno: l'occhio non deve aspettare.
    const span = Math.abs(value - from);
    const total = from === 0 ? durationMs : Math.max(350, Math.min(durationMs, 350 + span * 4));
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now + delayMs;
      const t = Math.min(1, Math.max(0, (now - start) / total));
      shown.current = from + (value - from) * easeOut(t);
      node.textContent = formatRef.current(Math.round(shown.current));
      if (t < 1) raf = requestAnimationFrame(tick);
      else shown.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs, delayMs, reduced, seen]);

  return (
    <span ref={boxRef}>
      {/* Prima della comparsa il numero e' gia' al suo posto (stessa larghezza: nessuno spostamento). */}
      <span ref={textRef} aria-hidden="true" className="tabular-nums">
        {format(reduced ? value : 0)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
