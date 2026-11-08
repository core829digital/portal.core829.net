"use client";

import { useState } from "react";
import { SignDialog, type SignOutcome } from "@/components/portal/SignDialog";

/** Finestra di firma con comportamento INVENTATO per le prove nel browser. Solo con E2E_FIXTURES=1 (vedi src/app/c/fixture/layout.tsx). */
export function SignFixture() {
  const [log, setLog] = useState<string[]>([]);
  const [open, setOpen] = useState(true);
  return (
    <>
      <p data-testid="log">{log.join(" | ") || "nessuna azione"}</p>
      {open ? (
        <SignDialog
          title="Contratto MSA"
          onClose={() => setOpen(false)}
          onOpenDocument={async () => void setLog((l) => [...l, "letto"])}
          onSign={async (input): Promise<SignOutcome> => {
            setLog((l) => [...l, `firma:${input.fullName}`]);
            if (input.fullName === "Codice Vecchio") return { ok: false, error: "Per firmare serve un codice appena ricevuto.", staleCode: true };
            if (input.fullName === "Nome Sbagliato") return { ok: false, error: "Scrivi il tuo nome e cognome per esteso." };
            setOpen(false);
            return { ok: true };
          }}
        />
      ) : null}
    </>
  );
}
