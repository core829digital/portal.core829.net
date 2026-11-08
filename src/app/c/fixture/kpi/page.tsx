"use client";

import { Wallet } from "lucide-react";
import { Kpi, KpiGrid } from "@/components/dash/Kpi";

/** Riga di indicatori con importi INVENTATI e lunghi, per la prova nel browser. Solo con E2E_FIXTURES=1. */
const rows: [string, string, string][] = [
  ["Incassato nel mese", "€ 12.480", "+18% vs mese scorso"],
  ["Da incassare", "€ 8.250", "fatture inviate e scadute"],
  ["Scaduto", "€ 1.200", "2 fatture"],
  ["Ricavi ricorrenti (MRR)", "€ 3.940", "€ 47.280 all'anno"],
  ["Rinnovi a 30 giorni", "6", "€ 2.150 previsti"],
  ["Clienti attivi", "24", "su 31 totali"],
  ["Progetti in corso", "9", "14 completati"],
];

export default function Page() {
  return (
    <div className="w-full px-4 xl:px-8">
      <KpiGrid label="Indicatori principali" oneRow={8}>
        <Kpi size="hero" index={0} tone="accent" icon={Wallet} label="Incassato 2026" value="€ 128.450" hint="€ 311.200 in totale" />
        {rows.map(([label, value, hint], i) => (
          <Kpi key={label} size="compact" index={i + 1} label={label} value={value} hint={hint} />
        ))}
      </KpiGrid>
    </div>
  );
}
