"use client";

import { ExternalLink, FilePlus2, FileStack, LogOut, Plus, UserPlus, UserRound } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuLink, DropdownMenuSeparator, DropdownMenuTrigger, MenuChevron } from "@/components/ui/dropdown-menu";
import { SITE_URL } from "@/lib/contact";

/** Barra a capsula dell'area admin: menu «Crea» e menu dell'account, nello stile dei menu di core829.net. */
export function AdminToolbar({ onSignOut }: { onSignOut: () => void }) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger variant="default" size="sm">
          <Plus aria-hidden /> <span className="hidden sm:inline">Crea</span>
          <span className="sr-only sm:hidden">Crea</span>
          <MenuChevron />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Crea</DropdownMenuLabel>
          <DropdownMenuLink href="/admin/clients?nuovo=1">
            <UserPlus aria-hidden /> Nuovo cliente
          </DropdownMenuLink>
          <DropdownMenuLink href="/admin/drafts?nuovo=1">
            <FilePlus2 aria-hidden /> Nuovo documento
          </DropdownMenuLink>
          <DropdownMenuLink href="/admin/templates">
            <FileStack aria-hidden /> Modelli di documento
          </DropdownMenuLink>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger variant="ghost" size="sm" aria-label="Account">
          <UserRound aria-hidden /> <span className="hidden sm:inline">Account</span>
          <MenuChevron />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>CORE829 · Amministrazione</DropdownMenuLabel>
          <DropdownMenuLink href={SITE_URL} external>
            <ExternalLink aria-hidden /> Apri core829.net
          </DropdownMenuLink>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onSignOut}>
            <LogOut aria-hidden /> Esci
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
