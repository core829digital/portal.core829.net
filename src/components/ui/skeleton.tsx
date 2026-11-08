import { cn } from "cn"

/** Segnaposto di caricamento con un riflesso che scorre (solo transform: fluido e leggero per la GPU). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn("skeleton rounded-md bg-muted", className)} {...props} />
}

export { Skeleton }
