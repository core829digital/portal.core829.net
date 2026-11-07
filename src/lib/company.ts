/**
 * Dati societari di CORE829 SRL, gli stessi pubblicati su core829.net (repo core829.net-new, lib/constants.ts).
 * Tenerli allineati se cambiano sul sito.
 */
export const COMPANY = {
  name: "CORE829 SRL",
  address: "Str. Mihai Eminescu, 10, Roman, Romania",
  regCom: "J2026029428009",
  cui: "54616345",
  phoneRo: "+40 766 668 482",
  phoneIt: "+39 375 946 8881",
  /** Domande generali e supporto. */
  emailSupport: "hello@core829.net",
  /** Questioni amministrative e di fatturazione. */
  emailOffice: "office@core829.net",
  /** Clienti attivi: il dipartimento progetti comunica da questo indirizzo. */
  emailProjects: "projects@core829.net",
  hours: "24/7",
  website: "https://core829.net",
} as const;

export const telHref = (phone: string): string => `tel:${phone.replace(/\s/g, "")}`;
