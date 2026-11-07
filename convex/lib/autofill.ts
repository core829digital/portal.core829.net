/**
 * Riempimento automatico dei documenti con i dati di CORE829 SRL e del cliente. Funzioni pure.
 *
 * Due meccanismi, per qualunque tipo di documento (contratto, preventivo, documento legale, altro) e formato:
 *  1. VARIABILI: i segnaposto {{chiave}} (anche in intestazioni e piè di pagina) e il riconoscimento dei campi.
 *  2. ETICHETTE: i campi vuoti dei moduli (celle, righe ____) si compilano quando la loro etichetta e' inequivocabile
 *     ("Sede legale", "P. IVA", "PEC", "Luogo e data"...). Nel dubbio il campo resta vuoto: meglio da compilare a mano
 *     che un dato sbagliato in un contratto.
 */

export const COMPANY = {
  name: "CORE829 SRL",
  address: "Str. Mihai Eminescu, 10, Roman, Romania",
  regCom: "J2026029428009",
  cui: "54616345",
  phoneRo: "+40 766 668 482",
  phoneIt: "+39 375 946 8881",
  email: "hello@core829.net",
  officeEmail: "office@core829.net",
  rep: "Stefan Serban",
  repRole: "Amministratore / Legale rappresentante",
  place: "Roman",
} as const;

export type ClientData = {
  displayName: string;
  contactName: string;
  email: string;
  phone: string | null;
  vatId: string | null;
  address: string | null;
  pec: string | null;
  legalRep: string | null;
  website: string | null;
};

export type DocCategory = "contract" | "quote" | "legal" | "other";

const PREFIX: Record<DocCategory, string> = { contract: "CTR", quote: "PRV", legal: "LEG", other: "DOC" };

/** Numero progressivo del documento: CTR-2026-001, PRV-2026-014... (`count` = quanti ce ne sono gia' nell'anno). */
export function documentNumber(category: DocCategory, year: number, count: number): string {
  return `${PREFIX[category]}-${year}-${String(count + 1).padStart(3, "0")}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Data come gg/mm/aaaa nel fuso di Roma. */
export function formatDateRome(ms: number): string {
  const parts = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" }).formatToParts(ms);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}

/** Tutte le variabili note. Del cliente si includono solo i valori presenti: gli altri segnaposto restano da compilare. */
export function buildVariables(client: ClientData, opts: { now: number; number: string }): Record<string, string> {
  const today = formatDateRome(opts.now);
  const year = String(new Date(opts.now).getUTCFullYear());
  const vars: Record<string, string> = {
    "client.name": client.displayName,
    "client.contact": client.contactName,
    "client.email": client.email,
    "company.name": COMPANY.name,
    "company.address": COMPANY.address,
    "company.vat": `CUI/CIF ${COMPANY.cui}`,
    "company.cui": COMPANY.cui,
    "company.regCom": COMPANY.regCom,
    "company.phone": COMPANY.phoneIt,
    "company.phoneRo": COMPANY.phoneRo,
    "company.phoneIt": COMPANY.phoneIt,
    "company.email": COMPANY.email,
    "company.officeEmail": COMPANY.officeEmail,
    "company.rep": COMPANY.rep,
    "company.repRole": COMPANY.repRole,
    "date.today": today,
    "date.year": year,
    "contract.number": opts.number,
    "contract.date": today,
    "contract.place": COMPANY.place,
    "place.date": `${COMPANY.place}, ${today}`,
  };
  if (client.phone) vars["client.phone"] = client.phone;
  if (client.vatId) vars["client.vat"] = client.vatId;
  if (client.address) vars["client.address"] = client.address;
  if (client.pec) vars["client.pec"] = client.pec;
  if (client.legalRep) vars["client.legalRep"] = client.legalRep;
  if (client.website) vars["client.website"] = client.website;
  return vars;
}

/** Etichetta in forma confrontabile: minuscolo, senza accenti, senza punteggiatura di contorno. */
export function normalizeLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’'`]/g, "'")
    .replace(/[:*_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Rule = { match: RegExp; not?: RegExp; key: string };

/**
 * Regole per etichetta, dalla piu' specifica alla piu' generica (vince la prima che corrisponde).
 * Si applicano solo a etichette brevi: un campo dentro una frase lunga non si compila mai da solo.
 */
export const LABEL_RULES: Rule[] = [
  { match: /^(contratto n\.?|n\.? contratto|numero( del)? contratto|riferimento msa n\.?|msa n\.?(\s*\/.*)?|n\.? documento|numero documento|protocollo)$/, key: "contract.number" },
  { match: /^(data( di)? (efficacia|contratto|del contratto|documento|emissione|attestazione|offerta|preventivo)|data)$/, key: "contract.date" },
  { match: /^luogo e data$|^luogo,? data$/, key: "place.date" },
  { match: /^(cliente|committente|denominazione.*|ragione sociale|nome e cognome|nome cliente|nome dell'attivita|societa cliente)$/, key: "client.name" },
  { match: /fatturazione/, key: "" }, // "indirizzo di fatturazione (se diverso)": lasciato vuoto
  { match: /^(sede legale|residenza|sede legale.*residenza|indirizzo|indirizzo sede|domicilio)$/, key: "client.address" },
  { match: /^(p\.? ?iva|partita iva|vat id|vat|p\.? ?iva.*vat.*|vat id.*)$|^p\.? iva/, key: "client.vat" },
  { match: /^pec$|^pec |posta elettronica certificata/, key: "client.pec" },
  { match: /^(email|e-mail|mail|indirizzo email)( amministrativa| del cliente)?$/, key: "client.email" },
  { match: /^(telefono|tel\.?|cellulare|recapito telefonico)$/, key: "client.phone" },
  { match: /^(rappresentante legale.*|legale rappresentante|rappresentato da|rappresentata da|firmatario)$/, key: "client.legalRep" },
  { match: /^(referente|referente operativo|persona di contatto|referente.*)$/, key: "client.contact" },
  { match: /^(sito web.*|sito|website|sito internet)$/, key: "client.website" },
];

const MAX_LABEL = 60;

/** Quale variabile corrisponde a un'etichetta, oppure null se non e' inequivocabile. */
export function variableForLabel(label: string): string | null {
  const n = normalizeLabel(label);
  if (n === "" || n.length > MAX_LABEL) return null;
  for (const rule of LABEL_RULES) {
    if (rule.match.test(n) && !(rule.not && rule.not.test(n))) return rule.key === "" ? null : rule.key;
  }
  return null;
}

export type AutofillField = { id: string; kind: "blank" | "checkbox" | "variable"; label: string; paragraph?: number; token?: string };

export type AutofillResult = {
  fills: Record<string, string>;
  /** Cosa e' stato compilato (per il riepilogo mostrato all'amministratore). */
  filled: { label: string; value: string }[];
};

/**
 * Compila i campi vuoti con le variabili, per etichetta. Le caselle non si toccano mai.
 * Se due campi di fila hanno la stessa etichetta si compila solo il primo (evita di duplicare un dato nelle celle accanto).
 */
export function autofillFields(fields: AutofillField[], vars: Record<string, string>): AutofillResult {
  const fills: Record<string, string> = {};
  const filled: { label: string; value: string }[] = [];
  let previousKey: string | null = null;
  let previousParagraph = -10;
  for (const f of fields) {
    if (f.kind === "checkbox") continue;
    const key = f.kind === "variable" ? null : variableForLabel(f.label);
    const value = key ? vars[key] : undefined;
    if (!key || value === undefined || value === "") {
      previousKey = null;
      continue;
    }
    const adjacentSame = previousKey === key && typeof f.paragraph === "number" && f.paragraph - previousParagraph <= 3;
    previousKey = key;
    previousParagraph = f.paragraph ?? previousParagraph;
    if (adjacentSame) continue;
    fills[f.id] = value;
    filled.push({ label: f.label, value });
  }
  return { fills, filled };
}
