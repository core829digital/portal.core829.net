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

// Tetto sul totale dei file JS del client, in KB gzip. Si alza solo con una decisione consapevole.
const BUDGET_TOTAL_KB = Number(process.env.BUNDLE_BUDGET_KB ?? 480);

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

const sizes = files
  .map((f) => ({ file: f.replace(".next/static/", ""), kb: gzipSync(readFileSync(f)).length / 1024 }))
  .sort((a, b) => b.kb - a.kb);
const total = sizes.reduce((sum, s) => sum + s.kb, 0);

console.log(`JavaScript del client: ${total.toFixed(0)} KB (gzip) in ${sizes.length} file. Tetto: ${BUDGET_TOTAL_KB} KB.`);
console.log("I 5 piu' pesanti:");
for (const s of sizes.slice(0, 5)) console.log(`  ${s.kb.toFixed(1).padStart(7)} KB  ${s.file}`);

if (!process.argv.includes("--report") && total > BUDGET_TOTAL_KB) {
  console.error(`\nSuperato il tetto di ${BUDGET_TOTAL_KB} KB di ${(total - BUDGET_TOTAL_KB).toFixed(0)} KB. Controlla cosa e' stato aggiunto.`);
  process.exit(1);
}
