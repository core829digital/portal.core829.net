const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

/** Importo in centesimi -> "1.234,50 €". */
export function formatCents(cents: number): string {
  return euro.format(cents / 100);
}
