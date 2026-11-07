/**
 * Riempimento automatico dei PDF con campi modulo (AcroForm): ogni campo di testo il cui nome e' inequivocabile
 * ("PEC", "Partita_IVA", "RagioneSociale"...) diventa un testo sovrapposto nella posizione del campo.
 * Il PDF originale non viene mai modificato: i testi sono annotazioni come quelle dell'editor, quindi restano modificabili.
 */
import { PDFDocument, PDFTextField } from "pdf-lib";
import { variableForLabel } from "./autofill";
import { LINE_HEIGHT, MAX_SIZE, MIN_SIZE, type PdfAnnotation } from "./pdfAnnotations";

/** "Partita_IVA", "ragioneSociale", "client.pec" -> "partita iva", "ragione sociale"... */
export function fieldNameToLabel(name: string): string {
  return name
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_.\-[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NAME_ALIASES: Record<string, string> = {
  "client name": "client.name",
  "client address": "client.address",
  "client vat": "client.vat",
  "client pec": "client.pec",
  "client email": "client.email",
  "client phone": "client.phone",
  "client contact": "client.contact",
  "client website": "client.website",
  "client legal rep": "client.legalRep",
  "company name": "company.name",
  "company address": "company.address",
  "company email": "company.email",
  "company phone": "company.phone",
  "company vat": "company.vat",
  "company cui": "company.cui",
  "company reg com": "company.regCom",
  "company rep": "company.rep",
  date: "date.today",
  "date today": "date.today",
  "contract number": "contract.number",
  "contract date": "contract.date",
};

export function variableForFieldName(name: string): string | null {
  const label = fieldNameToLabel(name);
  const alias = NAME_ALIASES[label.toLowerCase()];
  return alias ?? variableForLabel(label);
}

/** Annotazioni da sovrapporre ai campi di testo riconosciuti. Campi non riconosciuti o dati mancanti: nessuna annotazione. */
export async function autofillPdf(bytes: Uint8Array, vars: Record<string, string>): Promise<{ annotations: PdfAnnotation[]; filled: { label: string; value: string }[] }> {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  } catch {
    return { annotations: [], filled: [] };
  }
  const annotations: PdfAnnotation[] = [];
  const filled: { label: string; value: string }[] = [];
  let fields: ReturnType<ReturnType<PDFDocument["getForm"]>["getFields"]>;
  try {
    fields = pdf.getForm().getFields();
  } catch {
    return { annotations, filled };
  }
  const pages = pdf.getPages();
  const pageRefs = pages.map((p) => p.ref);
  for (const field of fields) {
    if (!(field instanceof PDFTextField)) continue;
    const key = variableForFieldName(field.getName());
    const value = key ? vars[key] : undefined;
    if (!value) continue;
    const existing = field.getText();
    if (existing && existing.trim() !== "") continue; // gia' compilato nel PDF: non si sovrascrive
    const widget = field.acroField.getWidgets()[0];
    if (!widget) continue;
    const rect = widget.getRectangle();
    const pageRef = widget.P();
    let pageIndex = pageRefs.findIndex((r) => pageRef && r.toString() === pageRef.toString());
    if (pageIndex < 0) pageIndex = pages.findIndex((p) => p.node.Annots()?.asArray().some((a) => a.toString() === widget.dict.toString()));
    if (pageIndex < 0 || !pages[pageIndex]) continue;
    const { width: pw, height: ph } = pages[pageIndex].getSize();
    // Corpo che sta nel campo; il testo e' centrato in verticale.
    const size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, 11, Math.floor(rect.height * 0.7)));
    const top = rect.y + rect.height / 2 + (size * LINE_HEIGHT) / 2;
    annotations.push({
      page: pageIndex,
      x: Math.min(0.98, Math.max(0, (rect.x + 2) / pw)),
      y: Math.min(0.98, Math.max(0, (ph - top) / ph)),
      text: value.slice(0, 200),
      size,
      color: "black",
      bold: false,
    });
    filled.push({ label: fieldNameToLabel(field.getName()), value });
  }
  return { annotations, filled };
}
