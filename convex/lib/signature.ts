import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { COMPANY } from "./autofill";
import { printable } from "./docPdf";
import { drawLetterhead, embedLogos } from "./brandSeal";

/**
 * Firma elettronica SEMPLICE del cliente (art. 3, n. 10, Reg. UE 910/2014 "eIDAS"): il cliente si identifica con il link personale
 * e il codice monouso ricevuto sulla sua email, dichiara nome e consenso. NON e' una firma avanzata ne' qualificata:
 * ha valore probatorio liberamente valutabile (art. 25 eIDAS) e non basta quando la legge richiede la forma scritta con firma
 * qualificata/digitale (es. alcuni atti immobiliari). Funzioni pure, senza accesso a database o rete.
 */

export { CONSENT_TEXTS, CONSENT_VERSION, FRESH_CODE_MS, SIGN_TTL_MS } from "./consent";
import { CONSENT_TEXTS, CONSENT_VERSION } from "./consent";

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Nome e cognome scritti dal cliente: almeno due parole di lettere, niente numeri ne' simboli strani, spazi normalizzati. */
export function cleanSignerName(raw: string): string | null {
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (name.length < 5 || name.length > 80) return null;
  if (!/^[\p{L}][\p{L}'’.\- ]*$/u.test(name)) return null;
  if (name.split(" ").filter((w) => /\p{L}{2,}/u.test(w)).length < 2) return null;
  return name;
}

export type Evidence = {
  requestId: string;
  documentTitle: string;
  docSha256: string;
  signerName: string;
  signerEmail: string;
  signedAt: number;
  otpVerifiedAt: number;
  ip: string;
  userAgent: string;
  consentVersion: string;
};

const rome = (ms: number) =>
  new Intl.DateTimeFormat("it-IT", { dateStyle: "full", timeStyle: "medium", timeZone: "Europe/Rome" }).format(new Date(ms));

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line === "" ? word : `${line} ${word}`;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        if (line !== "") out.push(line);
        // parola piu' larga della riga (es. un hash): si spezza
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > width) {
          let n = rest.length;
          while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
          out.push(rest.slice(0, n));
          rest = rest.slice(n);
        }
        line = rest;
      }
    }
    out.push(line);
  }
  return out;
}

/** Aggiunge in coda al PDF originale una pagina «Certificato di firma elettronica». Le pagine del documento non si toccano. */
export async function appendSignatureCertificate(original: Uint8Array, e: Evidence): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original, { updateMetadata: false });
  const last = pdf.getPages()[pdf.getPageCount() - 1];
  const size = last ? last.getSize() : { width: 595.28, height: 841.89 };
  const page: PDFPage = pdf.addPage([size.width, size.height]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const supported = new Set<number>(regular.getCharacterSet());
  const t = (s: string) => printable(s, supported);
  const logos = await embedLogos(pdf);
  const M = 56;
  const W = size.width - M * 2;
  drawLetterhead(page, logos, bold, M);

  let y = size.height - 112;
  page.drawText("Certificato di firma elettronica", { x: M, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 22;
  const line = (label: string, value: string, font: PDFFont = regular) => {
    page.drawText(t(label.toUpperCase()), { x: M, y, size: 7.5, font: bold, color: rgb(0.5, 0.5, 0.5) });
    y -= 12;
    for (const l of wrap(t(value), font, font === mono ? 8.5 : 10, W)) {
      page.drawText(l, { x: M, y, size: font === mono ? 8.5 : 10, font, color: rgb(0.1, 0.1, 0.1) });
      y -= font === mono ? 11 : 13;
    }
    y -= 6;
  };
  page.drawText(t(`Documento firmato con ${COMPANY.name}`), { x: M, y, size: 10, font: regular, color: rgb(0.35, 0.35, 0.35) });
  y -= 26;
  line("Documento", e.documentTitle);
  line("Firmatario", `${e.signerName} <${e.signerEmail}>`);
  line("Data e ora della firma", `${rome(e.signedAt)} (Europa/Roma) — ${new Date(e.signedAt).toISOString()} (UTC)`);
  line("Identificazione", `Link personale riservato e codice monouso inviato all'email del firmatario, confermato il ${rome(e.otpVerifiedAt)}.`);
  line("Indirizzo IP e browser", `${e.ip} — ${e.userAgent.slice(0, 160)}`);
  line("Impronta SHA-256 del documento firmato (pagine precedenti a questo certificato)", e.docSha256, mono);
  line("Identificativo della richiesta", e.requestId, mono);
  line("Dichiarazioni accettate dal firmatario", CONSENT_TEXTS.map((c, i) => `${i + 1}. ${c}`).join("\n"));
  y -= 4;
  const note =
    "Firma elettronica semplice ai sensi dell'art. 3, n. 10 del Regolamento (UE) 910/2014 (eIDAS). Ha efficacia probatoria valutabile liberamente (art. 25) e non sostituisce la firma qualificata o digitale dove la legge la richiede. Per verificare l'integrità: l'impronta SHA-256 qui sopra si calcola sul file PDF originale ricevuto prima della firma, conservato da CORE829.";
  for (const l of wrap(t(note), regular, 8, W)) {
    page.drawText(l, { x: M, y, size: 8, font: regular, color: rgb(0.4, 0.4, 0.4) });
    y -= 11;
  }
  page.drawText(t(`${COMPANY.name} · ${COMPANY.address} · CUI/CIF ${COMPANY.cui}`), { x: M, y: 34, size: 8, font: regular, color: rgb(0.45, 0.45, 0.45) });
  return pdf.save();
}
