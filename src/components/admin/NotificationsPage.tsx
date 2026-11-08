"use client";

import { useMutation, useQuery } from "convex/react";
import { Bell, ChevronDown, Paperclip, RotateCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/dash/DashShell";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";

type Status = "queued" | "sent" | "failed" | "skipped";
const STATUS_LABEL: Record<Status, string> = { queued: "In invio", sent: "Inviata", failed: "Non inviata", skipped: "Saltata" };
const STATUS_VARIANT: Record<Status, "default" | "secondary" | "destructive" | "outline"> = { queued: "secondary", sent: "default", failed: "destructive", skipped: "outline" };

const STATUS_FILTERS: { value: Status | "all"; label: string }[] = [
  { value: "all", label: "Tutte" },
  { value: "failed", label: "Non inviate" },
  { value: "skipped", label: "Saltate" },
  { value: "sent", label: "Inviate" },
];
const AUDIENCE_FILTERS: { value: "all" | "client" | "admin"; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "client", label: "Ai clienti" },
  { value: "admin", label: "A noi" },
];

function Chips<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className="h-8 rounded-full border px-3 text-[0.8rem] font-medium transition-colors aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground hover:bg-muted aria-pressed:hover:bg-primary"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Registro delle email automatiche (tutte, oppure di un solo cliente). */
export function NotificationsLog({ clientId, showFilters = true }: { clientId?: Id<"clients">; showFilters?: boolean }) {
  const [status, setStatus] = useState<Status | "all">("all");
  const [audience, setAudience] = useState<"all" | "client" | "admin">("all");
  const [open, setOpen] = useState<string | null>(null);
  const rows = useQuery(api.notifications.list, { clientId, status: status === "all" ? undefined : status, audience: audience === "all" ? undefined : audience });
  const retry = useMutation(api.notifications.retry);

  return (
    <div className="space-y-4">
      {showFilters ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Chips label="Stato" value={status} options={STATUS_FILTERS} onChange={setStatus} />
          {clientId ? null : <Chips label="Destinatario" value={audience} options={AUDIENCE_FILTERS} onChange={setAudience} />}
        </div>
      ) : null}
      {rows === undefined ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          <Bell aria-hidden className="mx-auto mb-2 size-5" /> Nessuna notifica con questi filtri.
        </p>
      ) : (
        <ul className="stagger divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 shadow-(--shadow-soft)">
          {rows.map((r) => {
            const expanded = open === r._id;
            return (
              <li key={r._id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r._id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span className="truncate text-sm font-medium">{r.subject}</span>
                    {r.hasAttachment ? <Paperclip aria-label="Con allegato" className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                    <ChevronDown aria-hidden className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                  </button>
                  <span className="tabular-nums text-xs text-muted-foreground">{formatDateTime(r.sentAt ?? r.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.label} · {r.audience === "client" ? "al cliente" : "a noi"}
                  {r.to ? ` · ${r.to}` : ""}
                  {r.clientId && !clientId ? (
                    <>
                      {" · "}
                      <Link href={`/admin/clients/${r.clientId}`} className="underline underline-offset-4">
                        {r.clientName}
                      </Link>
                    </>
                  ) : null}
                </p>
                {r.reason ? <p className="mt-1 text-xs text-muted-foreground">{r.reason}</p> : null}
                {r.status === "failed" ? (
                  <button
                    type="button"
                    className="mt-1.5 inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[0.8rem] font-medium hover:bg-muted"
                    onClick={() => void retry({ notificationId: r._id }).then(() => toast.success("Riprovo l'invio.")).catch((e: unknown) => toast.error(errorMessage(e)))}
                  >
                    <RotateCw aria-hidden className="size-3.5" /> Riprova
                  </button>
                ) : null}
                {expanded ? <p className="mt-2 whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-sm">{r.body}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" }) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 shadow-(--shadow-soft)">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "bad" && value > 0 ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

/** Interruttori per tipo di notifica. */
function Settings() {
  const settings = useQuery(api.notifications.settings, {});
  const setEnabled = useMutation(api.notifications.setEnabled);
  if (settings === undefined) return <Skeleton className="h-40 w-full rounded-2xl" />;
  const groups = [
    { title: "Email ai clienti", rows: settings.filter((s) => s.audience === "client") },
    { title: "Email a noi (amministrazione)", rows: settings.filter((s) => s.audience === "admin") },
  ];
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h2 className="mb-2 text-sm font-semibold">{g.title}</h2>
          <ul className="divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 shadow-(--shadow-soft)">
            {g.rows.map((s) => (
              <li key={s.kind} className="flex items-start gap-3 px-4 py-3">
                <input
                  id={`n-${s.kind}`}
                  type="checkbox"
                  checked={s.enabled}
                  className="mt-1 size-4 accent-primary"
                  onChange={(e) => void setEnabled({ kind: s.kind, enabled: e.target.checked }).catch((err: unknown) => toast.error(errorMessage(err)))}
                />
                <label htmlFor={`n-${s.kind}`} className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{s.label}</span>
                  <span className="block text-muted-foreground">{s.description}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Centro notifiche: ogni email automatica tra noi e i clienti, con possibilità di riprovare o spegnere un tipo. */
export function NotificationsPage() {
  const stats = useQuery(api.notifications.stats, {});
  const [tab, setTab] = useState<"log" | "settings">("log");
  return (
    <>
      <PageHeader kicker="Sistema" title="Centro notifiche" description="Tutte le email automatiche tra CORE829 e i clienti, in un solo posto. Le azioni fatte solo da noi nel portale non generano email." />
      {stats ? (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Inviate" value={stats.sent} />
          <Stat label="In invio" value={stats.queued} />
          <Stat label="Non inviate" value={stats.failed} tone="bad" />
          <Stat label="Saltate" value={stats.skipped} />
        </div>
      ) : null}
      {stats && stats.adminRecipients === 0 ? (
        <p role="alert" className="mb-4 rounded-2xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Nessun destinatario per le email a noi: imposta <code>NOTIFY_ADMIN_EMAILS</code> (oppure <code>ADMIN_EMAILS</code>) su Convex.
        </p>
      ) : null}
      <div role="tablist" aria-label="Sezioni" className="mb-4 flex gap-2">
        {([["log", "Registro"], ["settings", "Impostazioni"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="h-9 rounded-full border px-4 text-sm font-medium aria-selected:border-primary aria-selected:bg-primary aria-selected:text-primary-foreground hover:bg-muted aria-selected:hover:bg-primary">
            {label}
          </button>
        ))}
      </div>
      {tab === "log" ? <NotificationsLog /> : <Settings />}
    </>
  );
}
