"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

/**
 * Numero che "sale" fino al valore finale (animazione del brand). Il valore corretto e' sempre
 * presente per gli screen reader e, sul server o con "riduci animazioni", si vede subito.
 */
export function CountUp({ value, format, durationMs = 1000 }: { value: number; format: (n: number) => string; durationMs?: number }) {
  const reduced = useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => true);
  const [shown, setShown] = useState(value);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 4)))); // ease-out
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, durationMs, reduced]);

  return (
    <>
      <span aria-hidden="true">{format(reduced ? value : shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
