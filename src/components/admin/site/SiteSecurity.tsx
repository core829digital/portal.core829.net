"use client";

import { useAction } from "convex/react";
import { ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { BridgeError, SiteLoading } from "@/components/admin/site/SiteBits";
import { useSiteData } from "@/components/admin/site/useSiteData";
import { PageHeader } from "@/components/dash/DashShell";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";

const DEFENSES = [
  ["Accesso solo dal portale", "Le modifiche al sito passano dal portale: serve l'accesso amministratore con codice via email, controllato sul server a ogni richiesta."],
  ["Firma sulle scritture", "Ogni modifica al database del sito porta una firma calcolata dal segreto condiviso, che non lascia mai il server."],
  ["Indirizzo vincolato", "Il portale parla solo con un indirizzo https://….convex.cloud: nessun altro server può essere raggiunto da qui."],
  ["Testi ripuliti", "Titoli, articoli e impostazioni sono ripuliti da tag e caratteri non ammessi sia dal portale sia dal sito (nessun codice nelle pagine)."],
  ["Chiavi ammesse", "Si possono modificare solo le impostazioni previste (dati generali, SEO, pagina iniziale, FAQ)."],
  ["Registro", "Ogni modifica è scritta nel registro del sito e nel registro attività del portale."],
] as const;

/** Sicurezza e registro del sito Andromedia Web. */
export function SiteSecurity() {
  const { data, error, loading, reload } = useSiteData(api.siteActions.auditList, { limit: 80 });
  const purge = useAction(api.siteActions.eventsPurge);
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      <PageHeader
        kicker="Sito Andromedia Web"
        title="Sicurezza e registro"
        description="Le difese del collegamento con il sito e il registro di ogni modifica."
        actions={
          <Button variant="outline" onClick={() => setConfirm(true)}>
            <Trash2 aria-hidden /> Pulisci le statistiche vecchie
          </Button>
        }
      />
      <ul className="grid gap-3 md:grid-cols-2">
        {DEFENSES.map(([title, text]) => (
          <li key={title} className="flex items-start gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ul>
      <h2 className="font-display text-lg tracking-tight">Registro del sito</h2>
      {error && !data ? <BridgeError message={error} onRetry={() => void reload()} /> : null}
      {loading && !data ? <SiteLoading /> : null}
      {data ? (
        data.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Nessuna voce nel registro.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Quando</th>
                  <th className="px-4 py-2 font-medium">Chi</th>
                  <th className="px-4 py-2 font-medium">Azione</th>
                  <th className="px-4 py-2 font-medium">Su cosa</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.map((r) => (
                  <tr key={r._id}>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{formatDateTime(r.ts)}</td>
                    <td className="max-w-40 truncate px-4 py-2">{r.actor}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
                    <td className="max-w-64 truncate px-4 py-2 text-muted-foreground">
                      {r.target}
                      {r.detail ? ` · ${r.detail}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
      <ConfirmDialog
        open={confirm}
        title="Pulire le statistiche vecchie?"
        description="Si cancellano visite e clic registrati più di 90 giorni fa (fino a 1000 alla volta). Non si può annullare."
        confirmLabel="Pulisci"
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void purge({})
            .then((r) => toast.success(`Rimossi ${r.removed} eventi.`))
            .then(reload)
            .catch((e: unknown) => toast.error(errorMessage(e)));
        }}
      />
    </>
  );
}
