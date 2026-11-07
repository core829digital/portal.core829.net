import { describe, expect, it } from "vitest";
import { isIpAllowed, parseAllowlist, parseIp } from "./ipAllowlist";

describe("parseIp", () => {
  it("IPv4 valido", () => {
    expect(parseIp("192.168.1.10")).toEqual({ version: 4, value: 0xc0a8010an });
  });
  it.each(["", "256.1.1.1", "1.2.3", "1.2.3.4.5", "01.2.3.4", "1.2.3.-4", "abc", "1.2.3.4%eth0", "1.2.3.4/24"])("rifiuta %s", (bad) => {
    expect(parseIp(bad)).toBeNull();
  });
  it("IPv6 con compressione e IPv4 incorporato", () => {
    expect(parseIp("::1")).toEqual({ version: 6, value: 1n });
    expect(parseIp("2001:db8::1")?.version).toBe(6);
    expect(parseIp("::ffff:10.0.0.1")).toEqual({ version: 4, value: 0x0a000001n });
  });
  it.each(["1::2::3", "12345::1", "g::1", "1:2:3:4:5:6:7:8:9", "1:2:3:4:5:6:7", ":::", "1.2.3.4::"])("rifiuta IPv6 non valido %s", (bad) => {
    expect(parseIp(bad)).toBeNull();
  });
});

describe("isIpAllowed", () => {
  it("indirizzo singolo e intervallo CIDR IPv4", () => {
    const list = "203.0.113.5, 198.51.100.0/24";
    expect(isIpAllowed("203.0.113.5", list)).toBe(true);
    expect(isIpAllowed("203.0.113.6", list)).toBe(false);
    expect(isIpAllowed("198.51.100.200", list)).toBe(true);
    expect(isIpAllowed("198.51.101.1", list)).toBe(false);
  });
  it("IPv6 con CIDR", () => {
    expect(isIpAllowed("2600:1f24:64:8000::1", "2600:1f24:64:8000::/52")).toBe(true);
    expect(isIpAllowed("2600:1f24:65::1", "2600:1f24:64:8000::/52")).toBe(false);
  });
  it("versioni diverse non si confondono", () => {
    expect(isIpAllowed("::1", "0.0.0.1")).toBe(false);
    expect(isIpAllowed("10.0.0.1", "::/0")).toBe(false);
  });
  it("un IPv6 mappato su IPv4 vale come l'IPv4", () => {
    expect(isIpAllowed("::ffff:203.0.113.5", "203.0.113.5")).toBe(true);
  });
  it("/0 consente ogni indirizzo della stessa famiglia", () => {
    expect(isIpAllowed("8.8.8.8", "0.0.0.0/0")).toBe(true);
  });
  it("FAIL CLOSED: IP assente o non valido, elenco vuoto o tutto non valido -> rifiutato", () => {
    expect(isIpAllowed(null, "1.2.3.4")).toBe(false);
    expect(isIpAllowed("", "1.2.3.4")).toBe(false);
    expect(isIpAllowed("non-un-ip", "1.2.3.4")).toBe(false);
    expect(isIpAllowed("1.2.3.4", "")).toBe(false);
    expect(isIpAllowed("1.2.3.4", undefined)).toBe(false);
    expect(isIpAllowed("1.2.3.4", "rotto, 1.2.3.4/99, 300.0.0.0")).toBe(false);
  });
  it("le voci non valide vengono ignorate senza allargare l'elenco", () => {
    expect(parseAllowlist("1.2.3.4, rotto, 1.2.3.4/99")).toHaveLength(1);
    expect(isIpAllowed("1.2.3.5", "1.2.3.4, rotto")).toBe(false);
  });
});
