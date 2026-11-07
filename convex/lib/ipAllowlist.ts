/**
 * Elenco di indirizzi IP consentiti (singoli o intervalli CIDR, IPv4 e IPv6).
 *
 * IMPORTANTE: e' un livello AGGIUNTIVO. La difesa vera dei webhook e' la firma. Questo controllo vale solo se l'IP
 * del chiamante e' ricavato in modo affidabile; l'IP arriva in un'intestazione (X-Forwarded-For) e un'intestazione
 * puo' essere falsificata da chi non passa da un proxy fidato. Per un'applicazione vera dell'elenco serve un firewall
 * davanti al server. "Fail closed": con l'elenco attivo, un IP assente o non valido viene RIFIUTATO.
 */

type ParsedIp = { version: 4 | 6; value: bigint };
type Entry = { version: 4 | 6; value: bigint; bits: number };

function parseIpv4(text: string): bigint | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (!m) return null;
  let value = 0n;
  for (let i = 1; i <= 4; i++) {
    const octet = Number(m[i]);
    if (octet > 255 || (m[i].length > 1 && m[i].startsWith("0"))) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

function parseIpv6(text: string): bigint | null {
  if (text.length > 45 || !/^[0-9a-fA-F:.]+$/.test(text)) return null;
  const halves = text.split("::");
  if (halves.length > 2) return null;

  // Un IPv4 incorporato (es. ::ffff:1.2.3.4) e' valido solo in coda all'intero indirizzo.
  const toGroups = (part: string, allowTrailingV4: boolean): number[] | null => {
    if (part === "") return [];
    const groups: number[] = [];
    const pieces = part.split(":");
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      if (piece.includes(".")) {
        if (!allowTrailingV4 || i !== pieces.length - 1) return null;
        const v4 = parseIpv4(piece);
        if (v4 === null) return null;
        groups.push(Number(v4 >> 16n), Number(v4 & 0xffffn));
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return null;
        groups.push(parseInt(piece, 16));
      }
    }
    return groups;
  };

  // Con "::" la parte prima non puo' contenere un IPv4; senza "::" l'unica parte e' anche la coda.
  const head = toGroups(halves[0], halves.length === 1);
  const tail = halves.length === 2 ? toGroups(halves[1], true) : [];
  if (head === null || tail === null) return null;
  let groups: number[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...new Array<number>(missing).fill(0), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  return groups.reduce((acc, g) => (acc << 16n) | BigInt(g), 0n);
}

/** IPv4 oppure IPv6 (un IPv6 "mappato" su IPv4, ::ffff:1.2.3.4, vale come l'IPv4 corrispondente). */
export function parseIp(text: string): ParsedIp | null {
  const t = text.trim();
  if (t === "") return null;
  const v4 = parseIpv4(t);
  if (v4 !== null) return { version: 4, value: v4 };
  const v6 = parseIpv6(t);
  if (v6 === null) return null;
  if (v6 >> 32n === 0xffffn) return { version: 4, value: v6 & 0xffffffffn };
  return { version: 6, value: v6 };
}

function parseEntry(raw: string): Entry | null {
  const [address, length, ...rest] = raw.trim().split("/");
  if (rest.length > 0) return null;
  const ip = parseIp(address);
  if (!ip) return null;
  const max = ip.version === 4 ? 32 : 128;
  let bits = max;
  if (length !== undefined) {
    if (!/^\d{1,3}$/.test(length)) return null;
    bits = Number(length);
    if (bits > max) return null;
  }
  return { ...ip, bits };
}

export function parseAllowlist(raw: string | undefined): Entry[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map(parseEntry)
    .filter((e): e is Entry => e !== null);
}

/** Vero solo se l'IP e' valido E rientra in almeno una voce dell'elenco. Elenco vuoto o non valido: sempre falso. */
export function isIpAllowed(ip: string | null | undefined, rawAllowlist: string | undefined): boolean {
  if (!ip) return false;
  const parsed = parseIp(ip);
  if (!parsed) return false;
  return parseAllowlist(rawAllowlist).some((entry) => {
    if (entry.version !== parsed.version) return false;
    const total = entry.version === 4 ? 32n : 128n;
    const shift = total - BigInt(entry.bits);
    return parsed.value >> shift === entry.value >> shift;
  });
}
