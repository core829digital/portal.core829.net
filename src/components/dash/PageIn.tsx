/**
 * Contenitore di OGNI pagina (admin e portale): entrata morbida + la stessa spaziatura verticale tra i blocchi.
 * Un solo posto per entrambe le cose: se un wrapper di pagina dimentica lo spazio, i blocchi risultano incollati
 * (e il controllo `e2e/ui-audit.spec.ts` lo segnala).
 */
export function PageIn({ children }: { children: React.ReactNode }) {
  return <div className="page-in space-y-6">{children}</div>;
}
