"use client";

import type { LucideIcon } from "lucide-react";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "cn";

export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; badge?: string | number };
export type NavGroup = { label?: string; items: NavItem[] };

function isActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true;
  return !item.exact && pathname.startsWith(`${item.href}/`);
}

/**
 * Struttura comune di tutte le dashboard (admin e cliente): menu laterale a pagine, barra superiore
 * su telefono con menu a scomparsa. Nessuna scheda (tabs): ogni voce e' una pagina con il proprio indirizzo.
 */
export function DashShell({
  groups,
  kicker,
  footer,
  children,
}: {
  groups: NavGroup[];
  kicker: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Vai al contenuto
      </a>

      {/* Barra superiore (telefono e tablet) */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b bg-background/90 px-4 backdrop-blur lg:hidden">
        <Link href={groups[0]?.items[0]?.href ?? "/"}>
          <Image src="/brand/core829-logo.webp" alt="CORE829" width={96} height={26} priority unoptimized className="h-6 w-auto" />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="menu-laterale"
          className="inline-flex size-10 items-center justify-center rounded-full ring-1 ring-foreground/10 transition-colors hover:bg-muted"
        >
          <Menu aria-hidden className="size-5" />
          <span className="sr-only">Apri il menu</span>
        </button>
      </div>

      {open ? <div aria-hidden className="fade-in fixed inset-0 z-40 bg-foreground/40 lg:hidden" onClick={() => setOpen(false)} /> : null}

      <aside
        id="menu-laterale"
        aria-label="Menu"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-6 overflow-y-auto border-r bg-sidebar p-5 transition-transform duration-300 ease-(--ease-out-expo)",
          "lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-auto lg:max-w-none lg:translate-x-0 lg:visible",
          open ? "visible translate-x-0 shadow-(--shadow-lift)" : "invisible -translate-x-full",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <Link href={groups[0]?.items[0]?.href ?? "/"} className="block">
            <Image src="/brand/core829-logo.webp" alt="CORE829" width={120} height={32} priority unoptimized className="h-7 w-auto" />
            <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{kicker}</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex size-9 items-center justify-center rounded-full hover:bg-muted lg:hidden"
          >
            <X aria-hidden className="size-5" />
            <span className="sr-only">Chiudi il menu</span>
          </button>
        </div>

        <nav aria-label="Pagine" className="flex flex-1 flex-col gap-5">
          {groups.map((group, gi) => (
            <div key={group.label ?? gi} className="space-y-1">
              {group.label ? (
                <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{group.label}</p>
              ) : null}
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "group relative flex min-h-10 items-center gap-3 rounded-full px-3 text-sm transition-colors",
                      active ? "bg-brand-tint font-medium text-brand-deep" : "text-foreground/80 hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon aria-hidden className={cn("size-4 shrink-0 transition-colors", active ? "text-brand" : "text-muted-foreground group-hover:text-brand")} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge !== undefined ? (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 font-mono text-[10px] text-primary-foreground tabular-nums">{item.badge}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {footer ? <div className="border-t pt-4">{footer}</div> : null}
      </aside>

      <main id="contenuto" className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
      </main>
    </div>
  );
}

/** Intestazione di una pagina: etichetta tecnica, titolo, descrizione e azioni. */
export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="reveal flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {kicker ? (
          <p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-brand-deep">
            <span aria-hidden className="h-px w-8 bg-primary" />
            {kicker}
          </p>
        ) : null}
        <h1 className="font-display text-2xl leading-tight tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-prose text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
