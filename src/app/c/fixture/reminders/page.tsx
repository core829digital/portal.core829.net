"use client";

import { useState } from "react";
import { PaymentReminderRows, type ReminderClient } from "@/components/admin/PaymentReminderRows";
import { PageHeader } from "@/components/dash/DashShell";

/** Elenco dei promemoria con dati INVENTATI per la prova nel browser. Solo con E2E_FIXTURES=1. */
const d = (day: number) => Date.UTC(2026, 10, day, 11);
const clients: ReminderClient[] = [
  { clientId: "c1", name: "Ristorante Da Mario", email: "mario@esempio.it", notifyEmail: true, totalCents: 45_500, items: [{ key: "i1", kind: "invoice", label: "Pagamento n. 2026/014", dueAt: d(11), amountCents: 39_000 }, { key: "s1", kind: "subscription", label: "Rinnovo: Server dedicato", dueAt: d(11), amountCents: 6_500 }] },
  { clientId: "c2", name: "Studio Verdi", email: "info@studioverdi.it", notifyEmail: true, totalCents: 2_900, items: [{ key: "s2", kind: "subscription", label: "Rinnovo: Hosting sito", dueAt: d(14), amountCents: 2_900 }] },
  { clientId: "c3", name: "Officina Bianchi", email: "officina@bianchi.it", notifyEmail: false, totalCents: 6_500, items: [{ key: "s3", kind: "subscription", label: "Rinnovo: Server dedicato", dueAt: d(16), amountCents: 6_500 }] },
];

export default function Page() {
  const [selected, setSelected] = useState(new Set(["c1", "c2"]));
  return (
    <>
      <PageHeader kicker="Prova" title="Promemoria di pagamento" description="Chi riceverebbe il promemoria nei prossimi giorni." />
      <PaymentReminderRows clients={clients} selected={selected} onToggle={(id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />
      <p role="status">Selezionati: {[...selected].sort().join(",")}</p>
    </>
  );
}
