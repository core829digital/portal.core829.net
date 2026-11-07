/**
 * Controlli di sicurezza sui file caricati.
 *
 * Cosa fa (tutto sul server, mai fidandosi di nome o tipo dichiarati dal browser):
 *  1. ammette solo pochi tipi (PDF, PNG, JPEG, DOCX, XLSX) e una dimensione massima;
 *  2. legge i PRIMI BYTE del file per capire cosa e' davvero ("magic bytes");
 *  3. rifiuta programmi eseguibili anche se rinominati;
 *  4. verifica che l'estensione corrisponda al contenuto;
 *  5. cerca contenuti attivi: script e azioni automatiche nei PDF, macro nei documenti Office.
 *
 * Limiti onesti: sono controlli euristici. Non sostituiscono un antivirus: un PDF con codice nascosto
 * dentro flussi compressi, o un file Office costruito ad arte, potrebbero non essere riconosciuti.
 * Per questo i file escono SOLO dopo il controllo, sono serviti sempre come "scarica" (mai aperti
 * nel sito) e, se configurata, si confronta anche l'impronta del file con un database di malware noti.
 */

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

const TYPES = {
  pdf: { extensions: [".pdf"], mime: "application/pdf" },
  png: { extensions: [".png"], mime: "image/png" },
  jpg: { extensions: [".jpg", ".jpeg"], mime: "image/jpeg" },
  docx: { extensions: [".docx"], mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  xlsx: { extensions: [".xlsx"], mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
} as const;

export type FileType = keyof typeof TYPES;
export type Detected = FileType | "zip" | "executable" | null;

export const ALLOWED_EXTENSIONS: string[] = Object.values(TYPES).flatMap((t) => [...t.extensions]);

export function mimeFor(type: FileType): string {
  return TYPES[type].mime;
}

/** Ultima estensione, in minuscolo e con il punto (".pdf"). Vuota se non c'e'. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot <= 0 ? "" : fileName.slice(dot).toLowerCase();
}

export function typeForExtension(ext: string): FileType | null {
  for (const [type, def] of Object.entries(TYPES) as [FileType, (typeof TYPES)[FileType]][]) {
    if ((def.extensions as readonly string[]).includes(ext)) return type;
  }
  return null;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((b, i) => bytes[i] === b);
}

/** Che cos'e' davvero il file, guardando i primi byte. */
export function detectType(head: Uint8Array): Detected {
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return "zip"; // DOCX e XLSX sono archivi ZIP
  if (
    startsWith(head, [0x4d, 0x5a]) || // MZ: Windows .exe/.dll
    startsWith(head, [0x7f, 0x45, 0x4c, 0x46]) || // ELF: Linux
    startsWith(head, [0x23, 0x21]) || // #! : script
    startsWith(head, [0xcf, 0xfa, 0xed, 0xfe]) || // Mach-O
    startsWith(head, [0xce, 0xfa, 0xed, 0xfe]) ||
    startsWith(head, [0xca, 0xfe, 0xba, 0xbe]) // Mach-O universale / classe Java
  ) {
    return "executable";
  }
  return null;
}

export type Inspection = { ok: true; type: FileType; mime: string } | { ok: false; reason: string };

const reject = (reason: string): Inspection => ({ ok: false, reason });

/** Elimina i flussi binari (stream ... endstream) di un PDF: dentro i dati compressi i byte sono casuali. */
function stripPdfStreams(text: string): string {
  const parts: string[] = [];
  let pos = 0;
  for (;;) {
    const start = text.indexOf("stream", pos);
    if (start === -1) {
      parts.push(text.slice(pos));
      break;
    }
    parts.push(text.slice(pos, start));
    const end = text.indexOf("endstream", start + 6);
    if (end === -1) break;
    pos = end + 9;
  }
  return parts.join(" ");
}

// I nomi PDF possono essere offuscati con #xx (es. /J#61vaScript): si decodificano prima di cercare.
function decodePdfNames(text: string): string {
  return text.replace(/#([0-9a-fA-F]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

const PDF_ACTIVE_CONTENT = /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|SubmitForm|ImportData)(?![A-Za-z0-9])/;

export function inspectFile(input: { fileName: string; bytes: Uint8Array }): Inspection {
  const { fileName, bytes } = input;
  if (bytes.length === 0) return reject("Il file è vuoto.");
  if (bytes.length > MAX_FILE_BYTES) return reject(`Il file supera i ${MAX_FILE_BYTES / (1024 * 1024)} MB consentiti.`);

  const ext = extensionOf(fileName);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return reject(`Tipo di file non ammesso. Sono ammessi: ${ALLOWED_EXTENSIONS.join(", ")}.`);
  }
  const expected = typeForExtension(ext);
  if (expected === null) return reject("Tipo di file non ammesso.");

  const detected = detectType(bytes.subarray(0, 16));
  if (detected === "executable") return reject("Il file è un programma eseguibile.");

  const matches = detected === expected || ((expected === "docx" || expected === "xlsx") && detected === "zip");
  if (!matches) return reject("Il contenuto del file non corrisponde alla sua estensione.");

  const text = new TextDecoder("latin1").decode(bytes);

  if (expected === "pdf") {
    const visible = decodePdfNames(stripPdfStreams(text));
    if (PDF_ACTIVE_CONTENT.test(visible)) return reject("Il PDF contiene script o azioni automatiche. Esportalo di nuovo come PDF semplice.");
  }

  if (expected === "docx" || expected === "xlsx") {
    if (!text.includes("[Content_Types].xml")) return reject("Il documento non ha la struttura di un file Office valido.");
    if (text.includes("vbaProject")) return reject("Il documento contiene macro.");
  }

  return { ok: true, type: expected, mime: mimeFor(expected) };
}

/** Nome del file adatto all'intestazione Content-Disposition (RFC 6266 / 5987), senza caratteri pericolosi. */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
