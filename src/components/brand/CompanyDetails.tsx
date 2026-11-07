import { Building2, Clock, Mail, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import { COMPANY, telHref } from "@/lib/company";

function Item({ icon, label, children, dark }: { icon: ReactNode; label: string; children: ReactNode; dark: boolean }) {
  // Struttura valida per le liste di definizioni: dentro il <div> solo <dt> e <dd>.
  return (
    <div className="min-w-0">
      <dt className={cn("flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em]", dark ? "text-on-ink-muted" : "text-muted-foreground")}>
        <span aria-hidden className={dark ? "text-white" : "text-brand"}>
          {icon}
        </span>
        {label}
      </dt>
      <dd className="mt-2 space-y-1 text-sm leading-6">{children}</dd>
    </div>
  );
}

/** Dati aziendali di CORE829 SRL (sede, dati societari, contatti, orari). `tone="dark"` per sfondi scuri. */
export function CompanyDetails({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const dark = tone === "dark";
  const link = cn("underline-offset-4 hover:underline", dark ? "hover:text-white" : "hover:text-brand-deep");
  return (
    <dl className={cn("grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-4", dark ? "text-on-ink" : "text-foreground", className)}>
      <Item dark={dark} icon={<Building2 className="size-4" />} label="Sede legale e dati societari">
        <p className="font-medium">{COMPANY.name}</p>
        <p className={dark ? "text-on-ink-muted" : "text-muted-foreground"}>{COMPANY.address}</p>
        <p className={dark ? "text-on-ink-muted" : "text-muted-foreground"}>
          Reg. Com. {COMPANY.regCom} · CUI/CIF {COMPANY.cui}
        </p>
      </Item>
      <Item dark={dark} icon={<Mail className="size-4" />} label="Email">
        <p>
          <a className={link} href={`mailto:${COMPANY.emailProjects}`}>
            {COMPANY.emailProjects}
          </a>
          <span className={cn("block text-xs", dark ? "text-on-ink-muted" : "text-muted-foreground")}>Progetti e assistenza clienti</span>
        </p>
        <p>
          <a className={link} href={`mailto:${COMPANY.emailOffice}`}>
            {COMPANY.emailOffice}
          </a>
          <span className={cn("block text-xs", dark ? "text-on-ink-muted" : "text-muted-foreground")}>Amministrazione e fatturazione</span>
        </p>
        <p>
          <a className={link} href={`mailto:${COMPANY.emailSupport}`}>
            {COMPANY.emailSupport}
          </a>
          <span className={cn("block text-xs", dark ? "text-on-ink-muted" : "text-muted-foreground")}>Informazioni generali</span>
        </p>
      </Item>
      <Item dark={dark} icon={<Phone className="size-4" />} label="Telefoni">
        <p>
          <a className={link} href={telHref(COMPANY.phoneIt)}>
            {COMPANY.phoneIt}
          </a>
          <span className={cn("block text-xs", dark ? "text-on-ink-muted" : "text-muted-foreground")}>Italia</span>
        </p>
        <p>
          <a className={link} href={telHref(COMPANY.phoneRo)}>
            {COMPANY.phoneRo}
          </a>
          <span className={cn("block text-xs", dark ? "text-on-ink-muted" : "text-muted-foreground")}>Romania</span>
        </p>
      </Item>
      <Item dark={dark} icon={<Clock className="size-4" />} label="Orari">
        <p>{COMPANY.hours}</p>
        <p>
          <a className={link} href={COMPANY.website}>
            core829.net
          </a>
        </p>
      </Item>
    </dl>
  );
}
