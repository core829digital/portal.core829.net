/** Barra di avanzamento accessibile (0-100). */
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
        <div className="h-full rounded-full bg-primary" style={{ width: `${safe}%` }} />
      </div>
      <span className="w-10 text-right text-sm tabular-nums">{safe}%</span>
    </div>
  );
}
