#!/usr/bin/env node
/**
 * Controllo anti "Trojan Source": fallisce se un file di codice contiene caratteri invisibili,
 * di controllo o di inversione della direzione del testo (che possono nascondere codice
 * malevolo in una revisione). Usa le categorie Unicode, senza scrivere caratteri speciali qui.
 *
 *   Cf = formattazione (zero-width, bidi), Zl/Zp = separatori di riga/paragrafo, Cc = controllo.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const CHECKED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".css", ".md", ".yml", ".yaml", ".html", ".env", ".example",
]);

const SUSPICIOUS = /[\p{Cf}\p{Zl}\p{Zp}\p{Cc}]/u;
const ALLOWED_CONTROLS = new Set([0x09, 0x0a, 0x0d]); // tab, a-capo

function listFiles() {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\0").filter(Boolean);
}

let problems = 0;
for (const file of listFiles()) {
  if (!CHECKED_EXTENSIONS.has(extname(file))) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // file cancellato ma ancora nell'indice
  }
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const ch of line) {
      const cp = ch.codePointAt(0);
      if (ALLOWED_CONTROLS.has(cp)) continue;
      if (SUSPICIOUS.test(ch)) {
        problems++;
        const hex = cp.toString(16).toUpperCase().padStart(4, "0");
        console.error(`${file}:${i + 1}: carattere invisibile o di controllo U+${hex}`);
      }
    }
  });
}

if (problems > 0) {
  console.error(`\n${problems} problema/i trovato/i. Rimuovi i caratteri o sostituiscili con sequenze di escape testuali.`);
  process.exit(1);
}
console.log("check-unicode: nessun carattere invisibile o di controllo trovato.");
