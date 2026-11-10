"use client";

import { useMutation, useQuery } from "convex/react";
import { CalendarClock, Check, CircleCheck, Plus, Receipt, Repeat, PenLine, Trash2, Wrench } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { DeadlineItem } from "@convex/deadlines";
import { Field, NativeSelect, TextField } from "@/components/admin/Field";
import { PageHeader } from "@/components/dash/DashShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { groupDeadlines } from "@/lib/deadlineGroups";
import { dateInputToTimestamp, formatCents, formatDate, todayInput } from "@/lib/format";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";

const DAY = 86_400_000;
const ICON = { invoice: Receipt, subscription: Repeat, signature: PenLine, approval: CircleCheck, manual: Wrench } as const;
const KIND_LABEL = { invoice: "Fattura", subscription: "Rinnovo", signature: "Firma", approval: "Approvazione", manual: "Scadenza" } as const;
const CATEGORY_LABEL = { domain: "Dominio", hosting: "Hosting", contract: "Contratto", other: "Altro" } as const;

function daysLabel(at: number, now: number): string {
  const d = Math.floor((new Date(at).setUTCHours(0, 0, 0, 0) - new Date(now).setUTCHours(0, 0, 0, 0)) / DAY);
  if (d === 0) return "oggi";
  if (d === 1) return "domani";
  if (d === -1) return "ieri";
  return d < 0 ? `${-d} giorni fa` : `tra ${d} giorni`;
}

function NewDeadline({ onClose }: { onClose: () => void }) {
  const create = useMutation(api.deadlines.create);
  const clients = useQuery(api.clients.options, {});
  const [pending, setPending] = useState(false);
  const [clientId, setClientId] = useState("");
  const invoices = useQuery(api.invoices.listByClient, clientId ? { clientId: clientId as Id<"clients"> } : "skip");
  const subscriptions = useQuery(api.subscriptions.listByClient, clientId ? { clientId: clientId as Id<"clients"> } : "skip");
  const projects = useQuery(api.projects.listByClient, clientId ? { clientId: clientId as Id<"clients"> } : "skip");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const dueAt = dateInputToTimestamp(String(f.get("dueAt") ?? ""));
    if (dueAt === null) return toast.error("Scegli una data valida.");
    setPending(true);
    try {
      const about = String(f.get("about") ?? "");
      const [kind, linkId] = about.split(":");
      await create({
        ...(linkId && kind === "inv" ? { invoiceId: linkId as Id<"invoices"> } : {}),
        ...(linkId && kind === "sub" ? { subscriptionId: linkId as Id<"subscriptions"> } : {}),
        ...(linkId && kind === "prj" ? { projectId: linkId as Id<"projects"> } : {}),
        title: String(f.get("title") ?? ""),
        dueAt,
        category: String(f.get("category")) as keyof typeof CATEGORY_LABEL,
        clientId: clientId ? (clientId as Id<"clients">) : undefined,
        notes: String(f.get("notes") ?? "").trim() || undefined,
      });
      toast.success("Scadenza aggiunta.");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  const options = clients ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuova scadenza</DialogTitle>
          <DialogDescription>Per ciò che il portale non sa da solo: dominio, hosting, contratti. Ti avvisiamo 7 giorni prima.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          <TextField id="title" label="Cosa scade" required minLength={2} maxLength={120} autoFocus />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="dueAt" label="Data" type="date" required defaultValue={todayInput(30)} />
            <Field id="category" label="Tipo">
              <NativeSelect id="category" name="category" defaultValue="domain">
                {(Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field id="clientId" label="Cliente (facoltativo)">
            <NativeSelect id="clientId" name="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Nessuno</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {clientId ? (
            <Field id="about" label="Collega a (facoltativo)" hint="Se il pagamento viene incassato o l'abbonamento annullato, la scadenza si chiude da sola.">
              <NativeSelect id="about" name="about" defaultValue="">
                <option value="">Niente di specifico</option>
                {(invoices ?? []).filter((x) => x.status === "sent" || x.status === "overdue" || x.status === "draft").length > 0 ? (
                  <optgroup label="Fatture da incassare">
                    {(invoices ?? []).filter((x) => x.status === "sent" || x.status === "overdue" || x.status === "draft").map((x) => (
                      <option key={x._id} value={`inv:${x._id}`}>
                        {x.number} · {formatCents(x.amountCents)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {(subscriptions ?? []).filter((x) => x.status !== "cancelled").length > 0 ? (
                  <optgroup label="Abbonamenti">
                    {(subscriptions ?? []).filter((x) => x.status !== "cancelled").map((x) => (
                      <option key={x._id} value={`sub:${x._id}`}>
                        {x.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {(projects ?? []).length > 0 ? (
                  <optgroup label="Progetti">
                    {(projects ?? []).map((x) => (
                      <option key={x._id} value={`prj:${x._id}`}>
                        {x.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </NativeSelect>
            </Field>
          ) : null}
          <Field id="notes" label="Note" hint="Appaiono nell'email di promemoria.">
            <Textarea id="notes" name="notes" maxLength={1000} rows={3} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvataggio…" : "Aggiungi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({ item, now }: { item: DeadlineItem; now: number }) {
  const setDone = useMutation(api.deadlines.setDone);
  const remove = useMutation(api.deadlines.remove);
  const Icon = ICON[item.kind];
  const href = item.kind === "invoice" ? `/admin/clients/${item.clientId}/invoices` : item.kind === "subscription" ? `/admin/clients/${item.clientId}/subscriptions` : item.kind === "signature" ? "/admin/signatures" : item.kind === "approval" ? "/admin/approvals" : item.clientId ? `/admin/clients/${item.clientId}` : null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {href ? (
            <Link href={href} className="hover:underline">
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {KIND_LABEL[item.kind]}
          {item.category ? ` · ${CATEGORY_LABEL[item.category]}` : ""}
          {item.clientName ? ` · ${item.clientName}` : ""}
          {item.related.length > 0 ? ` · ${item.related.join(", ")}` : ""}
          {item.notes ? ` · ${item.notes}` : ""}
        </span>
      </span>
      {item.amountCents !== null ? <span className="text-sm font-medium tabular-nums">{formatCents(item.amountCents)}</span> : null}
      <span className="text-right text-xs text-muted-foreground tabular-nums">
        {formatDate(item.at)} · {daysLabel(item.at, now)}
      </span>
      {item.manualId ? (
        <span className="flex gap-1">
          <Button size="icon-sm" variant="outline" aria-label={`Segna come fatto: ${item.title}`} onClick={() => void setDone({ deadlineId: item.manualId!, done: true }).catch((e: unknown) => toast.error(errorMessage(e)))}>
            <Check aria-hidden />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label={`Elimina: ${item.title}`} onClick={() => void remove({ deadlineId: item.manualId! }).catch((e: unknown) => toast.error(errorMessage(e)))}>
            <Trash2 aria-hidden />
          </Button>
        </span>
      ) : null}
    </li>
  );
}

/** Scadenziario: tutto ciò che scade, per urgenza. */
export function DeadlinesPage() {
  const [now] = useState(() => Math.floor(Date.now() / 3_600_000) * 3_600_000);
  const items = useQuery(api.deadlines.overview, { nowMs: now });
  const [adding, setAdding] = useState(false);
  const buckets = items ? groupDeadlines(items, now) : [];
  return (
    <>
      <PageHeader kicker="Lavoro e incassi" title="Scadenziario" description="Fatture, rinnovi, firme in attesa e le tue scadenze (dominio, hosting, contratti) in un unico elenco, dalla più urgente." />
      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden /> Nuova scadenza
        </Button>
      </div>
      {items === undefined ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : buckets.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          <CalendarClock aria-hidden className="mx-auto mb-2 size-5" /> Nessuna scadenza nei prossimi 6 mesi.
        </div>
      ) : (
        buckets.map((b) => (
          <section key={b.id} aria-label={b.title} className="space-y-3">
            <h2 className="flex items-center gap-2 font-display text-base tracking-tight">
              {b.title}
              <Badge variant={b.tone === "bad" ? "destructive" : b.tone === "warn" ? "default" : "secondary"}>{b.items.length}</Badge>
            </h2>
            <ul className="stagger divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 shadow-(--shadow-soft)">
              {b.items.map((i) => (
                <Row key={i.key} item={i} now={now} />
              ))}
            </ul>
          </section>
        ))
      )}
      {adding ? <NewDeadline onClose={() => setAdding(false)} /> : null}
    </>
  );
}
