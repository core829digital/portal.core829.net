"use client";

import { useState } from "react";
import { PageHeader } from "@/components/dash/DashShell";
import { ApprovalDialog, type ApprovalDecision } from "@/components/portal/ApprovalDialog";
import { Button } from "@/components/ui/button";

/** Finestra di approvazione con dati INVENTATI per la prova nel browser. Solo con E2E_FIXTURES=1. */
export default function Page() {
  const [mode, setMode] = useState<ApprovalDecision | null>(null);
  const [result, setResult] = useState<string>("");
  return (
    <>
      <PageHeader kicker="Prova" title="Approvazioni" description="Documento «Preventivo sito» in attesa di approvazione." />
      <div className="flex gap-2">
        <Button onClick={() => setMode("approve")}>Approva</Button>
        <Button variant="outline" onClick={() => setMode("changes")}>
          Richiedi modifiche
        </Button>
      </div>
      <p role="status">{result}</p>
      {mode ? (
        <ApprovalDialog
          title="Preventivo sito"
          mode={mode}
          message="Ti chiediamo l'ok entro fine mese."
          onClose={() => setMode(null)}
          onDecide={async ({ fullName, comment }) => {
            if (fullName.length < 3) return "Scrivi il tuo nome e cognome.";
            setResult(`${mode}:${fullName}:${comment}`);
            setMode(null);
            return null;
          }}
        />
      ) : null}
    </>
  );
}
