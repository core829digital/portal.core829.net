/**
 * Stati di una fattura e passaggi ammessi. Fonte unica: la usano sia il server (per rifiutare
 * passaggi non validi) sia l'interfaccia (per mostrare solo le azioni possibili).
 * `paid` e `cancelled` sono definitivi.
 */
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["paid", "overdue", "cancelled"],
  overdue: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

/** Stati in cui la fattura non si puo' piu' modificare. */
export function isInvoiceFinal(status: InvoiceStatus): boolean {
  return INVOICE_TRANSITIONS[status].length === 0;
}
