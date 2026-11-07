import type { ComponentProps, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Etichetta + campo + eventuale suggerimento, con collegamento corretto per l'accessibilita'. */
export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function TextField({
  id,
  label,
  hint,
  ...props
}: { id: string; label: string; hint?: string } & Omit<ComponentProps<typeof Input>, "id">) {
  return (
    <Field id={id} label={label} hint={hint}>
      <Input id={id} name={id} {...props} />
    </Field>
  );
}

/** Menu a tendina nativo: accessibile, funziona su ogni browser e su telefono. */
export function NativeSelect({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <select
      className={
        "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 " +
        className
      }
      {...props}
    />
  );
}
