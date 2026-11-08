"use client";

import { useId, useState, type CSSProperties } from "react";
import { cn } from "cn";

export type Point = { label: string; value: number };

/** Curva morbida che passa per i punti (spline di Catmull-Rom), mai sotto la linea di base. */
function smoothPath(pts: { x: number; y: number }[], floorY: number): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = Math.min(floorY, p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = Math.min(floorY, p2.y - (p3.y - p1.y) / 6);
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x},${p2.y}`;
  }
  return d;
}

const W = 600;
const H = 200;
const PAD_Y = 14;

/** Grafico ad area con linea che si disegna; passando il mouse (o col tocco) si legge il valore del punto. */
export function AreaChart({
  points,
  format,
  ariaLabel,
}: {
  points: Point[];
  format: (n: number) => string;
  ariaLabel: string;
}) {
  const gid = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value));
  const xy = points.map((p, i) => ({
    x: points.length === 1 ? W / 2 : (i / (points.length - 1)) * W,
    y: PAD_Y + (1 - p.value / max) * (H - PAD_Y * 2),
  }));
  const line = smoothPath(xy, H - PAD_Y);
  const area = xy.length ? `${line} L${xy[xy.length - 1].x},${H} L${xy[0].x},${H} Z` : "";
  const shown = active ?? points.length - 1;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setActive(Math.round(ratio * (points.length - 1)));
  };

  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-mono uppercase tracking-[0.12em]">{points[shown]?.label}</span>
        <span className="font-display text-base text-foreground tabular-nums">{points[shown] ? format(points[shown].value) : "—"}</span>
      </figcaption>
      <div className="relative" onPointerMove={onMove} onPointerLeave={() => setActive(null)} role="img" aria-label={ariaLabel}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="draw-line block h-44 w-full overflow-visible sm:h-52" aria-hidden="true" data-testid="area-svg">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--brand-red)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--brand-red)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((r) => (
            <line key={r} x1="0" x2={W} y1={H * r} y2={H * r} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="3 5" />
          ))}
          <path d={area} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke="var(--brand-red)" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" data-testid="area-line" />
        </svg>
        {points.length > 0 ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-px bg-primary/30"
              style={{ left: `${(xy[shown].x / W) * 100}%` }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-primary/20"
              style={{ left: `${(xy[shown].x / W) * 100}%`, top: `${(xy[shown].y / H) * 100}%` }}
            />
          </>
        ) : null}
      </div>
      <div aria-hidden className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {points.map((p, i) => (
          <span key={`${p.label}-${i}`} className={cn(points.length > 8 && i % 2 === 1 && "hidden sm:inline", i === shown && "text-brand-deep")}>
            {p.label}
          </span>
        ))}
      </div>
      <div className="sr-only">
        <table>
        <caption>{ariaLabel}</caption>
        <tbody>
          {points.map((p, i) => (
            <tr key={`${p.label}-${i}`}>
              <th scope="row">{p.label}</th>
              <td>{format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}

/** Colonne verticali; l'ultima (la piu' recente) e' in rosso pieno, le altre in rosato. */
export function BarChart({ points, format, ariaLabel }: { points: Point[]; format: (n: number) => string; ariaLabel: string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <figure className="min-w-0">
      <div className="flex h-36 items-end gap-1.5 sm:gap-2" role="img" aria-label={ariaLabel}>
        {points.map((p, i) => (
          <div key={`${p.label}-${i}`} className="flex h-full min-w-0 flex-1 items-end" title={`${p.label}: ${format(p.value)}`}>
            <div
              className={cn("grow-y w-full rounded-t-md", i === points.length - 1 ? "bg-primary" : "bg-chart-5")}
              style={{ height: `${Math.max(p.value > 0 ? 4 : 1, (p.value / max) * 100)}%`, "--i": i } as CSSProperties}
            />
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-2 flex gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:gap-2">
        {points.map((p, i) => (
          <span key={`${p.label}-${i}`} className="min-w-0 flex-1 truncate text-center">
            {p.label}
          </span>
        ))}
      </div>
      <div className="sr-only">
        <table>
        <caption>{ariaLabel}</caption>
        <tbody>
          {points.map((p, i) => (
            <tr key={`${p.label}-${i}`}>
              <th scope="row">{p.label}</th>
              <td>{format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}

/** Anello di avanzamento (0-100) con valore al centro. */
export function Ring({ value, label, caption }: { value: number; label: string; caption?: string }) {
  const safe = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className="relative mx-auto size-36" role="img" aria-label={`${label}: ${safe}%`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r="48" fill="none" stroke="var(--brand-tint)" strokeWidth="14" />
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="none"
          stroke="var(--brand-red)"
          strokeWidth="14"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${safe} 100`}
          className="ring-sweep"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl tabular-nums">{safe}%</span>
        {caption ? <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{caption}</span> : null}
      </div>
    </div>
  );
}

export type Segment = { label: string; value: number; count?: number; color: string };

/** Barra orizzontale a segmenti con legenda: ripartizione di un totale. */
export function StackBar({ segments, format, ariaLabel }: { segments: Segment[]; format: (n: number) => string; ariaLabel: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={ariaLabel}>
        {total > 0
          ? segments
              .filter((s) => s.value > 0)
              .map((s, i) => (
                <div key={s.label} className="grow-x h-full" style={{ width: `${(s.value / total) * 100}%`, background: s.color, "--i": i } as CSSProperties} />
              ))
          : null}
      </div>
      <ul className="grid gap-1.5 text-xs">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: s.color }} />
              {s.label}
              {typeof s.count === "number" ? <span className="text-muted-foreground">({s.count})</span> : null}
            </span>
            <span className="font-medium tabular-nums">{format(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Classifica orizzontale (es. clienti per incassato). */
export function RankList({ rows, format, empty }: { rows: { label: string; value: number }[]; format: (n: number) => string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              <span className="mr-2 font-mono text-[11px] text-brand-deep">{String(i + 1).padStart(2, "0")}</span>
              {r.label}
            </span>
            <span className="shrink-0 font-medium tabular-nums">{format(r.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-brand-tint">
            <div className="grow-x h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%`, "--i": i } as CSSProperties} />
          </div>
        </li>
      ))}
    </ol>
  );
}
