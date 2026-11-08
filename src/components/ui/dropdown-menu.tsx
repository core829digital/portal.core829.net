"use client";

import { Menu } from "@base-ui/react/menu";
import { ChevronDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

/**
 * Menu a tendina nello stile di core829.net (pannello "vetro", angoli morbidi, apertura animata).
 * Basato su Base UI: tastiera (frecce, Invio, Esc, ricerca per lettera), focus e ARIA gestiti dalla libreria.
 */
export const DropdownMenu = Menu.Root;

export function DropdownMenuTrigger({ className, variant = "outline", size = "default", children, ...props }: ComponentProps<typeof Menu.Trigger> & { variant?: "outline" | "default" | "ghost"; size?: "default" | "sm" | "icon" }) {
  return (
    <Menu.Trigger className={cn(buttonVariants({ variant, size }), "gap-1.5", className)} {...props}>
      {children}
    </Menu.Trigger>
  );
}

/** Freccetta da mettere dentro il pulsante che apre il menu. */
export function MenuChevron() {
  return <ChevronDown aria-hidden className="size-3.5 opacity-70 transition-transform group-aria-expanded/button:rotate-180" />;
}

export function DropdownMenuContent({ className, align = "end", children, ...props }: Omit<ComponentProps<typeof Menu.Popup>, "align"> & { align?: "start" | "center" | "end"; children: ReactNode }) {
  return (
    <Menu.Portal>
      <Menu.Positioner align={align} sideOffset={8} className="z-[70] outline-none">
        <Menu.Popup className={cn("menu-popup glass-panel min-w-56 max-w-[calc(100vw-1.5rem)] rounded-2xl p-1.5 outline-none", className)} {...props}>
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

const itemClass =
  "flex min-h-10 w-full cursor-default items-center gap-2.5 rounded-xl px-3 text-left text-sm outline-none select-none transition-colors data-[highlighted]:bg-foreground/[0.06] data-[highlighted]:text-brand-deep [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground data-[highlighted]:[&_svg]:text-brand";

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
  return <Menu.Item className={cn(itemClass, className)} {...props} />;
}

/** Voce che porta a un indirizzo (interno o esterno). */
export function DropdownMenuLink({ className, href, external = false, children }: { className?: string; href: string; external?: boolean; children: ReactNode }) {
  return (
    <Menu.LinkItem className={cn(itemClass, className)} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </Menu.LinkItem>
  );
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{children}</div>;
}

export function DropdownMenuSeparator() {
  return <Menu.Separator className="mx-2 my-1.5 h-px bg-foreground/10" />;
}
