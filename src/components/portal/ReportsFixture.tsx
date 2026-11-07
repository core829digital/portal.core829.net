"use client";

import { useState } from "react";
import { PageHeader } from "@/components/dash/DashShell";
import { ReportsBrowser, type ReportData } from "@/components/portal/PortalReports";

/** Report con dati INVENTATI per le prove nel browser. Raggiungibile solo con E2E_FIXTURES=1 (vedi src/app/c/fixture/layout.tsx). */
const NOV = Date.UTC(2026, 10, 1);
const OCT = Date.UTC(2026, 9, 1);
const report: ReportData = {
  month: NOV,
  summary: "Un ottimo mese: il sito è cresciuto e la campagna ha portato nuovi contatti.\n<script>alert('xss')</script>",
  nextSteps: "Campagna di dicembre e nuove foto del menu.",
  metrics: [
    { key: "web.visits", label: "Visite al sito", unit: "count", value: 1520, note: null, previous: 1000 },
    { key: "web.bounce", label: "Frequenza di rimbalzo", unit: "percent", value: 41.5, note: null, previous: 46 },
    { key: "web.duration", label: "Durata media della visita", unit: "seconds", value: 125, note: "da Google Analytics", previous: null },
    { key: "social.instagram.followers", label: "Follower totali", unit: "count", value: 2300, note: null, previous: 2300 },
    { key: "ads.spend", label: "Spesa pubblicitaria", unit: "eur", value: 350.5, note: null, previous: 400 },
  ],
  auto: { paidCents: 50000, paidCount: 1, invoicesIssued: 2, projectUpdates: 3, documentsDelivered: 1, activeSubscriptions: 2, monthlyRecurringCents: 10800 },
};

export function ReportsFixture() {
  const [selected, setSelected] = useState(NOV);
  const [downloads, setDownloads] = useState(0);
  return (
    <>
      <PageHeader kicker="Risultati" title="Report mensili" description="Come sono andati i tuoi servizi ogni mese." />
      <ReportsBrowser
        months={[{ month: NOV }, { month: OCT }]}
        selected={selected}
        onSelect={setSelected}
        report={selected === NOV ? report : null}
        onDownload={() => setDownloads((n) => n + 1)}
        downloading={false}
      />
      <p data-testid="downloads" className="mt-4 text-xs text-muted-foreground">Download richiesti: {downloads}</p>
    </>
  );
}
