"use client";

import { AreaChart } from "@/components/dash/charts";

/** Grafico con dati INVENTATI (12 mesi fino a novembre) per la prova nel browser. Solo con E2E_FIXTURES=1. */
const labels = ["DIC", "GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV"];
const values = [0, 120, 0, 340, 200, 0, 0, 90, 410, 150, 80, 620];

export default function Page() {
  return (
    <div className="max-w-3xl">
      <AreaChart ariaLabel="Incassato per mese negli ultimi 12 mesi" format={(n) => `${n} €`} points={labels.map((label, i) => ({ label, value: values[i] }))} />
    </div>
  );
}
