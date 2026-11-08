"use client";

import { CountUp } from "@/components/dash/CountUp";

/** Barra di avanzamento accessibile (0-100): si riempie da sinistra quando entra nello schermo; se il valore cambia scorre dolcemente. */
export function ProgressBar({ value }: { value: number }) {
  const safe = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-valuenow={safe}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Avanzamento"
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div className="grow-x h-full rounded-full bg-primary transition-[width] duration-700 ease-(--ease-out-expo)" style={{ width: `${safe}%` }} />
      </div>
      <span className="w-12 text-right text-sm tabular-nums">
        <CountUp value={safe} format={(n) => `${n}%`} durationMs={900} />
      </span>
    </div>
  );
}
