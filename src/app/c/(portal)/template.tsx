/** Rimontato a ogni cambio di pagina: il contenuto entra con una dissolvenza morbida (il menu laterale resta fermo). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in space-y-6">{children}</div>;
}
