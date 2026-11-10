"use client";

import { useMutation, useQuery } from "convex/react";
import { BellRing, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import { PAYMENT_NOTICE } from "@convex/lib/notifyKinds";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { PaymentReminderRows } from "@/components/admin/PaymentReminderRows";
import { PageHeader } from "@/components/dash/DashShell";
import { Panel } from "@/components/dash/Kpi";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";

const DAY_CHOICES = [1, 7, 14, 30] as const;

/** Promemoria di pagamento: automatico (10:30, giorno prima) e invio a tutti con un clic. */
export function PaymentRemindersPage() {
  const [nowMs] = useState(() => Math.floor(Date.now() / 3_600_000) * 3_600_000);
  const [days, setDays] = useState<number>(7);
  const data = useQuery(api.paymentReminders.preview, { nowMs, days });
  const sendNow = useMutation(api.paymentReminders.sendNow);
  const setEnabled = useMutation(api.notifications.setEnabled);
  const [picked, setPicked] = useState<Set<string> | null>(null); // null = tutti quelli inviabili
  const [confirm, setConfirm] = useState<"all" | "selected" | null>(null);
  const [pending, setPending] = useState(false);

  const sendable = useMemo(() => (data?.clients ?? []).filter((c) => c.notifyEmail).map((c) => c.clientId), [data]);
  const selected = useMemo(() => new Set(picked ?? sendable), [picked, sendable]);
  const chosen = sendable.filter((id) => selected.has(id));

  function toggle(clientId: string) {
    const next = new Set(selected);
    if (next.has(clientId)) next.delete(clientId);
    else next.add(clientId);
    setPicked(next);
  }

  async function run(which: "all" | "selected") {
    setPending(true);
    try {
      const r = await sendNow({ days, clientIds: which === "all" ? undefined : (chosen as never) });
      toast.success(
        r.sent > 0 ? `Inviati ${r.sent} promemoria.${r.alreadySent > 0 ? ` ${r.alreadySent} erano già stati inviati nelle ultime 20 ore.` : ""}` : r.alreadySent > 0 ? "Nessun invio: i promemoria sono già partiti nelle ultime 20 ore." : "Nessun promemoria da inviare.",
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
      setConfirm(null);
    }
  }

  const count = confirm === "selected" ? chosen.length : sendable.length;

  return (
    <>
      <PageHeader kicker="Lavoro e incassi" title="Promemoria di pagamento" description="L'unico promemoria che i clienti ricevono: ricorda la scadenza di rate e pagamenti e avvisa dei costi aggiuntivi in caso di mancato pagamento." />

      <Panel title="Invio automatico" description="Parte da solo, ogni giorno.">
        <div className="flex flex-wrap items-start gap-4">
          <BellRing aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
          <p className="min-w-0 flex-1 text-sm leading-6">
            Ogni giorno alle <b>10:30 (ora italiana)</b> il sistema scrive ai clienti che hanno una scadenza <b>il giorno dopo</b>: pagamenti emessi e non ancora saldati e rinnovi degli abbonamenti attivi. Una sola email per cliente, anche con più scadenze. Se il sistema era spento, recupera fino alle 18:59.
          </p>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={data?.autoEnabled ?? true}
              disabled={data === undefined}
              onChange={(e) => void setEnabled({ kind: "payment_reminder", enabled: e.target.checked }).catch((err: unknown) => toast.error(errorMessage(err)))}
            />
            Invio automatico attivo
          </label>
        </div>
        <details className="rounded-xl bg-muted/50 p-3 text-sm">
          <summary className="cursor-pointer font-medium">Testo dell&apos;avviso nelle email</summary>
          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{PAYMENT_NOTICE}</p>
        </details>
      </Panel>

      <Panel title="Invio con un clic" description="Scegli entro quanti giorni guardare le scadenze, controlla chi riceverà l'email e invia.">
        <div role="group" aria-label="Scadenze entro" className="flex flex-wrap items-center gap-1.5">
          {DAY_CHOICES.map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => { setDays(d); setPicked(null); }} className="h-8 rounded-full border px-3 text-[0.8rem] font-medium hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary">
              {d === 1 ? "Oggi e domani" : `Entro ${d} giorni`}
            </button>
          ))}
        </div>
        {data === undefined ? (
          <Skeleton className="h-40 w-full rounded-2xl" />
        ) : data.clients.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nessuna scadenza in questo periodo: non c&apos;è nulla da ricordare.</p>
        ) : (
          <>
            <PaymentReminderRows clients={data.clients} selected={selected} onToggle={toggle} />
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={pending || sendable.length === 0} onClick={() => setConfirm("all")}>
                <Send aria-hidden /> Invia a tutti ({sendable.length})
              </Button>
              <Button variant="outline" disabled={pending || chosen.length === 0 || chosen.length === sendable.length} onClick={() => setConfirm("selected")}>
                Invia ai selezionati ({chosen.length})
              </Button>
              <span className="text-xs text-muted-foreground">Chi ha già ricevuto un promemoria nelle ultime 20 ore non lo riceve due volte.</span>
            </div>
          </>
        )}
      </Panel>

      {confirm ? (
        <ConfirmDialog
          open
          title={`Inviare ${count} promemoria?`}
          description={`Partiranno ${count} email da clients@core829.net con le scadenze dei prossimi ${days === 1 ? "giorni (oggi e domani)" : `${days} giorni`} e l'avviso sui costi aggiuntivi. Non si possono richiamare una volta inviate.`}
          confirmLabel={`Invia ${count}`}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void run(confirm)}
        />
      ) : null}
    </>
  );
}
