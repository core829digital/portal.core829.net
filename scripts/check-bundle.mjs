#!/usr/bin/env node
/**
 * Tetto al peso del JavaScript inviato al browser (compresso con gzip, come lo scaricherebbe un cliente).
 * Va lanciato DOPO `next build`. Serve a notare subito se una dipendenza o una modifica gonfia le pagine.
 *   node scripts/check-bundle.mjs            # controlla
 *   node scripts/check-bundle.mjs --report   # mostra solo i numeri
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// Tetto sul totale dei file JS del client (tutte le pagine insieme), in KB gzip. Si alza solo con una decisione consapevole.
// 480 -> 520 KB (nov 2026): editor con anteprima live, import Excel, report mensili, modelli. Il portale cliente carica solo le sue pagine.
// 520 -> 580 KB: backoffice del sito Andromedia (solo pagine admin: il cliente non le scarica).
const BUDGET_TOTAL_KB = Number(process.env.BUNDLE_BUDGET_KB ?? 580);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

const root = ".next/static";
let files;
try {
  files = walk(root);
} catch {
  console.error("Cartella .next/static non trovata: lancia prima `npm run build`.");
  process.exit(2);
}

// pdf.js (visualizzatore PDF dell'editor) e' caricato SOLO quando si apre un PDF nell'editor, non nelle altre pagine:
// ha un tetto a parte, cosi' non gonfia il peso delle pagine normali. Si riconosce dal contenuto.
const BUDGET_PDF_KB = Number(process.env.BUNDLE_BUDGET_PDF_KB ?? 350);
const PDF_MARKER = /WorkerMessageHandler|GlobalWorkerOptions|pdfjsVersion/;

const all = files.map((f) => {
  const raw = readFileSync(f);
  return { file: f.replace(".next/static/", ""), kb: gzipSync(raw).length / 1024, pdf: PDF_MARKER.test(raw.toString("utf8")) };
});
const sizes = all.filter((s) => !s.pdf).sort((a, b) => b.kb - a.kb);
const pdfSizes = all.filter((s) => s.pdf);
const total = sizes.reduce((sum, s) => sum + s.kb, 0);
const pdfTotal = pdfSizes.reduce((sum, s) => sum + s.kb, 0);

console.log(`JavaScript del client: ${total.toFixed(0)} KB (gzip) in ${sizes.length} file. Tetto: ${BUDGET_TOTAL_KB} KB.`);
console.log(`Visualizzatore PDF (solo nell'editor PDF): ${pdfTotal.toFixed(0)} KB in ${pdfSizes.length} file. Tetto: ${BUDGET_PDF_KB} KB.`);
console.log("I 5 piu' pesanti:");
for (const s of sizes.slice(0, 5)) console.log(`  ${s.kb.toFixed(1).padStart(7)} KB  ${s.file}`);

if (!process.argv.includes("--report")) {
  let failed = false;
  if (total > BUDGET_TOTAL_KB) {
    console.error(`\nSuperato il tetto di ${BUDGET_TOTAL_KB} KB di ${(total - BUDGET_TOTAL_KB).toFixed(0)} KB. Controlla cosa e' stato aggiunto.`);
    failed = true;
  }
  if (pdfTotal > BUDGET_PDF_KB) {
    console.error(`\nIl visualizzatore PDF supera il tetto di ${BUDGET_PDF_KB} KB di ${(pdfTotal - BUDGET_PDF_KB).toFixed(0)} KB.`);
    failed = true;
  }
  if (failed) process.exit(1);
}
