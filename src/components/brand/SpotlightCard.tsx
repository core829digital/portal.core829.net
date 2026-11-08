"use client";

import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from "react";

/**
 * Scheda con un riflesso di luce che segue il cursore (solo con mouse/trackpad, mai sul tocco).
 * Aggiorna due variabili CSS con un solo fotogramma per volta: nessun ridisegno di React.
 */
export function SpotlightCard({
  as: Tag = "section",
  className,
  style,
  children,
  ...rest
}: {
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  "aria-labelledby"?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    };
    el.addEventListener("pointermove", move, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", move);
    };
  }, []);
  return (
    <Tag ref={ref} className={`spotlight ${className ?? ""}`} style={style} {...rest}>
      {children}
    </Tag>
  );
}
