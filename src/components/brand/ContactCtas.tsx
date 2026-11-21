import { ArrowRight, Mail } from "lucide-react";
import { cn } from "cn";
import { CONTACT_EMAIL, CONTACT_FORM_URL } from "@/lib/contact";
import { GlassScene, GLASS } from "@/components/ui/LiquidGlass";

/** Azioni per chi non e' ancora cliente: il modulo del sito (preferito) oppure una email. `tone="dark"` per sfondi scuri. */
export function ContactCtas({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const base = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium transition-colors";
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row", className)}>
      <GlassScene className="overflow-hidden rounded-full p-1.5 sm:shrink-0">
        <a {...GLASS} href={CONTACT_FORM_URL} target="_blank" rel="noopener noreferrer" className={cn(base, "bg-primary text-primary-foreground hover:bg-brand-deep")}>
          Scrivici dal modulo contatti
          <ArrowRight aria-hidden className="size-4" />
          <span className="sr-only">(si apre in una nuova scheda)</span>
        </a>
      </GlassScene>
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className={cn(
          base,
          tone === "dark" ? "bg-white/10 text-on-ink ring-1 ring-white/25 hover:bg-white/15" : "bg-card text-foreground ring-1 ring-foreground/15 hover:bg-muted",
        )}
      >
        <Mail aria-hidden className="size-4" />
        {CONTACT_EMAIL}
      </a>
    </div>
  );
}
