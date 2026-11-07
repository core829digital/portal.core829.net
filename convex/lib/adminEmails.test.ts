import { describe, expect, it } from "vitest";
import { isAllowedAdminEmail, parseAdminEmails } from "./adminEmails";

describe("parseAdminEmails", () => {
  it("separa per virgola, normalizza e ignora le voci vuote", () => {
    expect(parseAdminEmails(" Stefan@Core829.net , ,altro@core829.net ")).toEqual(["stefan@core829.net", "altro@core829.net"]);
  });
  it("variabile assente: nessun indirizzo autorizzato", () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails("")).toEqual([]);
  });
});

describe("isAllowedAdminEmail", () => {
  const list = "stefan@core829.net,altro@core829.net";
  it("accetta solo gli indirizzi in elenco, senza distinguere maiuscole", () => {
    expect(isAllowedAdminEmail("STEFAN@core829.net", list)).toBe(true);
    expect(isAllowedAdminEmail("  altro@core829.net ", list)).toBe(true);
  });
  it("rifiuta tutto il resto", () => {
    expect(isAllowedAdminEmail("intruso@esempio.it", list)).toBe(false);
    expect(isAllowedAdminEmail("stefan@core829.net.evil.com", list)).toBe(false);
    expect(isAllowedAdminEmail("xstefan@core829.net", list)).toBe(false);
    expect(isAllowedAdminEmail("", list)).toBe(false);
    expect(isAllowedAdminEmail(undefined, list)).toBe(false);
    expect(isAllowedAdminEmail({ toString: () => "stefan@core829.net" }, list)).toBe(false);
  });
  it("senza elenco configurato nessuno entra", () => {
    expect(isAllowedAdminEmail("stefan@core829.net", undefined)).toBe(false);
  });
});
