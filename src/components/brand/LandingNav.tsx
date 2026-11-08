"use client";

import { ArrowUpRight, ExternalLink, FileText, Mail, MessageCircle, Phone } from "lucide-react";
import Image from "next/image";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuLink, DropdownMenuTrigger, MenuChevron } from "@/components/ui/dropdown-menu";
import { COMPANY, telHref } from "@/lib/company";
import { CONTACT_EMAIL, CONTACT_FORM_URL, SITE_URL } from "@/lib/contact";

/** Testata della pagina d'accesso: capsula "vetro" come sul sito core829.net, con menu a tendina dei contatti. */
export function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
      <div className="glass-bar fade-in flex h-14 w-full max-w-3xl items-center justify-between gap-1 rounded-full pl-4 pr-1.5">
        <a href={SITE_URL} aria-label="CORE829, vai al sito" className="flex min-h-11 items-center">
          <Image src="/brand/core829-logo.webp" alt="CORE829" width={120} height={32} priority unoptimized className="h-7 w-auto" />
        </a>
        <div className="flex items-center gap-1">
          <a
            href={SITE_URL}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground transition-colors hover:bg-foreground/[0.06] hover:text-brand-deep"
          >
            core829.net <ArrowUpRight aria-hidden className="size-3.5" />
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger variant="default" size="sm" className="h-9 px-4 font-mono text-[11px] uppercase tracking-[0.14em]">
              <MessageCircle aria-hidden /> Contattaci
              <MenuChevron />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Non sei ancora cliente?</DropdownMenuLabel>
              <DropdownMenuLink href={CONTACT_FORM_URL} external>
                <FileText aria-hidden /> Compila il modulo
              </DropdownMenuLink>
              <DropdownMenuLink href={`mailto:${CONTACT_EMAIL}`}>
                <Mail aria-hidden /> {CONTACT_EMAIL}
              </DropdownMenuLink>
              <DropdownMenuLink href={telHref(COMPANY.phoneIt)}>
                <Phone aria-hidden /> {COMPANY.phoneIt}
              </DropdownMenuLink>
              <DropdownMenuLink href={SITE_URL} external>
                <ExternalLink aria-hidden /> Il sito core829.net
              </DropdownMenuLink>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
