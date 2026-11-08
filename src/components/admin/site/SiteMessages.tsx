"use client";

import { useAction } from "convex/react";
import { Mail, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { SiteMessage } from "@convex/siteActions";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { BridgeError, SiteLoading } from "@/components/admin/site/SiteBits";
import { useSiteData } from "@/components/admin/site/useSiteData";
import { PageHeader } from "@/components/dash/DashShell";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";

/** Collegamento «scrivi a»: l'indirizzo e' codificato, cosi' non puo' aggiungere intestazioni (cc, bcc...) al messaggio. */
const reply = (email: string) => `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}?subject=${encodeURIComponent("Re: la tua richiesta ad Andromedia Web")}`;

/** Messaggi arrivati dal modulo contatti del sito. */
export function SiteMessages() {
  const { data, error, loading, reload } = useSiteData(api.siteActions.messagesList, {});
  const remove = useAction(api.siteActions.messageRemove);
  const [toDelete, setToDelete] = useState<SiteMessage | null>(null);

  return (
    <>
      <PageHeader kicker="Sito Andromedia Web" title="Messaggi" description="Le richieste inviate dal modulo contatti. Rispondi dalla tua email: il pulsante apre un messaggio già indirizzato." />
      {error && !data ? <BridgeError message={error} onRetry={() => void reload()} /> : null}
      {loading && !data ? <SiteLoading /> : null}
      {data ? (
        data.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Nessun messaggio ricevuto.</p>
        ) : (
          <ul className="space-y-3">
            {data.map((m) => (
              <li key={m._id} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 shadow-(--shadow-soft)">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="font-medium">{m.name}</p>
                  <a href={reply(m.email)} className="text-sm underline underline-offset-4">
                    {m.email}
                  </a>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDateTime(m.createdAt)} · {m.source}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{m.message}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" nativeButton={false} render={<a href={reply(m.email)} />}>
                    <Mail aria-hidden /> Rispondi
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setToDelete(m)}>
                    <Trash2 aria-hidden /> Elimina
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}
      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminare il messaggio?"
        description={`Il messaggio di ${toDelete?.name ?? ""} verrà cancellato per sempre.`}
        confirmLabel="Elimina"
        destructive
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const m = toDelete;
          setToDelete(null);
          if (m) void remove({ id: m._id }).then(() => toast.success("Messaggio eliminato.")).then(reload).catch((err: unknown) => toast.error(errorMessage(err)));
        }}
      />
    </>
  );
}
