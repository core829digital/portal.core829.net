import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "cn";

export type KpiTone = "default" | "accent" | "warn";

/**
 * Scheda di una metrica (stile "pillola" del brand). `accent` = rosso pieno (metrica principale),
 * `warn` = rosato (richiede attenzione). `delta` e' la variazione percentuale: null = non mostrarla.
 */
export function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  delta,
  index = 0,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: KpiTone;
  delta?: number | null;
  index?: number;
}) {
  const accent = tone === "accent";
  return (
    <div
      role="listitem"
      className={cn(
        "reveal relative flex min-w-0 flex-col gap-2 rounded-2xl p-4 ring-1 sm:p-5",
        accent && "bg-primary text-primary-foreground ring-primary shadow-(--shadow-lift)",
        tone === "warn" && "bg-brand-tint text-foreground ring-primary/20",
        tone === "default" && "bg-card text-card-foreground ring-foreground/10 shadow-(--shadow-soft)",
      )}
      style={{ "--i": index } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "font-mono text-[11px] uppercase tracking-[0.12em]",
            accent ? "text-primary-foreground" : tone === "warn" ? "text-brand-deep" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        {Icon ? <Icon aria-hidden className={cn("size-4 shrink-0", accent ? "text-primary-foreground" : "text-brand")} /> : null}
      </div>
      <div className="font-display text-2xl leading-none tracking-tight tabular-nums sm:text-[1.7rem]">{value}</div>
      <div className="flex min-h-5 flex-wrap items-center gap-x-2 text-xs">
        {typeof delta === "number" ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums",
              accent ? "bg-white/20 text-primary-foreground" : delta >= 0 ? "bg-brand-tint text-brand-deep" : "bg-muted text-foreground",
            )}
          >
            {delta >= 0 ? <ArrowUpRight aria-hidden className="size-3" /> : <ArrowDownRight aria-hidden className="size-3" />}
            {delta > 0 ? "+" : ""}
            {delta}%
          </span>
        ) : null}
        {hint ? <span className={accent ? "text-primary-foreground" : "text-muted-foreground"}>{hint}</span> : null}
      </div>
    </div>
  );
}

/** Contenitore degli indicatori: elenco semantico, griglia fluida. */
export function KpiGrid({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="list" aria-label={label} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {children}
    </div>
  );
}

/** Pannello bianco arrotondato del brand, con titolo in carattere display. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  index = 0,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  index?: number;
}) {
  return (
    <section
      aria-label={title}
      className={cn("reveal flex min-w-0 flex-col gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 shadow-(--shadow-soft) sm:p-5", className)}
      style={{ "--i": index } as CSSProperties}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base tracking-tight">{title}</h2>
          {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
