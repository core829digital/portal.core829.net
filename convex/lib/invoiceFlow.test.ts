import { describe, expect, it } from "vitest";
import { INVOICE_TRANSITIONS, isInvoiceFinal, type InvoiceStatus } from "./invoiceFlow";

describe("flusso delle fatture", () => {
  it("pagata e annullata sono definitive", () => {
    expect(isInvoiceFinal("paid")).toBe(true);
    expect(isInvoiceFinal("cancelled")).toBe(true);
    expect(isInvoiceFinal("draft")).toBe(false);
  });
  it("nessuno stato porta a se stesso e ogni destinazione esiste", () => {
    const all = Object.keys(INVOICE_TRANSITIONS) as InvoiceStatus[];
    for (const from of all) {
      for (const to of INVOICE_TRANSITIONS[from]) {
        expect(to).not.toBe(from);
        expect(all).toContain(to);
      }
    }
  });
  it("una bozza non si salda direttamente", () => {
    expect(INVOICE_TRANSITIONS.draft).not.toContain("paid");
  });
});
