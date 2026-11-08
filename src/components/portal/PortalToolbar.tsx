"use client";

import { ExternalLink, Mail, MessageCircle, Phone } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuLink, DropdownMenuTrigger, MenuChevron } from "@/components/ui/dropdown-menu";
import { COMPANY, telHref } from "@/lib/company";
import { CONTACT_EMAIL, SITE_URL } from "@/lib/contact";

/** Barra a capsula del portale cliente: un menu «Contatta CORE829» sempre a portata di mano. */
export function PortalToolbar() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger variant="default" size="sm">
        <MessageCircle aria-hidden /> <span className="hidden sm:inline">Contatta CORE829</span>
        <span className="sr-only sm:hidden">Contatta CORE829</span>
        <MenuChevron />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Parla con noi</DropdownMenuLabel>
        <DropdownMenuLink href={`mailto:${CONTACT_EMAIL}`}>
          <Mail aria-hidden /> Scrivici · {CONTACT_EMAIL}
        </DropdownMenuLink>
        <DropdownMenuLink href={telHref(COMPANY.phoneIt)}>
          <Phone aria-hidden /> Chiamaci · {COMPANY.phoneIt}
        </DropdownMenuLink>
        <DropdownMenuLink href={SITE_URL} external>
          <ExternalLink aria-hidden /> Il sito core829.net
        </DropdownMenuLink>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
