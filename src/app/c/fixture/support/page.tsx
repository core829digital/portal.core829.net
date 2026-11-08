"use client";

import { useState } from "react";
import { PageHeader } from "@/components/dash/DashShell";
import { NewTicketForm, ReplyBox, Thread, TicketList, type TicketMessage, type TicketRow } from "@/components/support/TicketViews";

/** Assistenza con dati INVENTATI per la prova nel browser. Solo con E2E_FIXTURES=1. */
const now = Date.UTC(2026, 10, 14, 9, 30);
const rows: TicketRow[] = [
  { id: "t1", subject: "Il sito non carica la home", category: "issue", status: "waiting_client", lastMessageAt: now, messageCount: 3 },
  { id: "t2", subject: "Vorrei cambiare il logo nel footer", category: "request", status: "open", lastMessageAt: now - 86_400_000, messageCount: 1 },
  { id: "t3", subject: "Fattura di ottobre", category: "billing", status: "closed", lastMessageAt: now - 5 * 86_400_000, messageCount: 4 },
];
const messages: TicketMessage[] = [
  { id: "m1", author: "client", body: "Da stamattina la home è bianca su telefono.", createdAt: now - 7_200_000 },
  { id: "m2", author: "admin", body: "Grazie della segnalazione, stiamo controllando.", createdAt: now - 3_600_000 },
  { id: "m3", author: "admin", body: "Risolto: era la cache. Prova ora e dimmi se è tutto a posto.", createdAt: now },
];

export default function Page() {
  const [mode, setMode] = useState<"list" | "new" | "thread">("list");
  return (
    <>
      <PageHeader kicker="Aiuto" title="Assistenza" description="Scrivici una richiesta e segui le risposte qui." />
      <div className="flex gap-2">
        {(["list", "thread", "new"] as const).map((m) => (
          <button key={m} type="button" className="h-8 rounded-full border px-3 text-sm" aria-pressed={mode === m} onClick={() => setMode(m)}>
            {m === "list" ? "Elenco" : m === "thread" ? "Conversazione" : "Nuova"}
          </button>
        ))}
      </div>
      {mode === "list" ? <TicketList rows={rows} side="client" onSelect={() => setMode("thread")} empty="Nessuna richiesta." /> : null}
      {mode === "thread" ? (
        <div className="space-y-6">
          <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
            <Thread messages={messages} me="client" />
          </div>
          <ReplyBox onSend={async () => undefined} />
        </div>
      ) : null}
      {mode === "new" ? <NewTicketForm onCancel={() => setMode("list")} onCreate={async () => undefined} /> : null}
    </>
  );
}
