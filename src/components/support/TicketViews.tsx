"use client";

import { Check, MessageSquare } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Field, NativeSelect } from "@/components/admin/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";

/** Componenti di presentazione dei ticket, condivisi da portale cliente e pannello admin (e dalla pagina di prova). */

export type TicketStatus = "open" | "in_progress" | "waiting_client" | "closed";
export type TicketCategory = "question" | "issue" | "request" | "billing";

export const CATEGORY_LABEL: Record<TicketCategory, string> = { question: "Domanda", issue: "Problema", request: "Richiesta di modifica", billing: "Fatture e pagamenti" };

/** Etichette dal punto di vista di chi guarda: il cliente legge «Risposto», noi «Da rispondere». */
export const STATUS_LABEL = {
  client: { open: "In attesa di risposta", in_progress: "In lavorazione", waiting_client: "Ti abbiamo risposto", closed: "Chiusa" },
  admin: { open: "Da rispondere", in_progress: "In lavorazione", waiting_client: "In attesa del cliente", closed: "Chiusa" },
} as const;

const STATUS_VARIANT: Record<TicketStatus, "default" | "secondary" | "outline"> = { open: "default", in_progress: "secondary", waiting_client: "outline", closed: "outline" };

export type TicketRow = { id: string; subject: string; category: TicketCategory; status: TicketStatus; lastMessageAt: number; messageCount: number; clientName?: string; related?: string[] };

export type Relatable = { invoices: { id: string; label: string }[]; subscriptions: { id: string; label: string }[]; projects: { id: string; label: string }[] };
export type TicketRelatedIds = { invoiceId?: string; subscriptionId?: string; projectId?: string };

/** «Riguarda»: i collegamenti del ticket (pagamento, abbonamento, progetto). */
export function RelatedChips({ labels }: { labels?: string[] }) {
  if (!labels || labels.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5" aria-label="Riguarda">
      {labels.map((l) => (
        <Badge key={l} variant="secondary">
          {l}
        </Badge>
      ))}
    </span>
  );
}

export function TicketStatusBadge({ status, side }: { status: TicketStatus; side: "client" | "admin" }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[side][status]}</Badge>;
}

export function TicketList({ rows, side, selectedId, onSelect, empty }: { rows: TicketRow[]; side: "client" | "admin"; selectedId?: string | null; onSelect: (id: string) => void; empty: ReactNode }) {
  if (rows.length === 0) return <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{empty}</div>;
  return (
    <ul className="stagger divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 shadow-(--shadow-soft)" aria-label="Richieste di assistenza">
      {rows.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => onSelect(r.id)} aria-current={selectedId === r.id ? "true" : undefined} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3.5 text-left hover:bg-muted/50 aria-[current=true]:bg-brand-tint/60">
            <MessageSquare aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{r.subject}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {r.clientName ? `${r.clientName} · ` : ""}
                {CATEGORY_LABEL[r.category]}
                {r.related && r.related.length > 0 ? ` · ${r.related.join(", ")}` : ""} · {r.messageCount} {r.messageCount === 1 ? "messaggio" : "messaggi"} · {formatDateTime(r.lastMessageAt)}
              </span>
            </span>
            <TicketStatusBadge status={r.status} side={side} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export type TicketMessage = { id: string; author: "client" | "admin"; body: string; createdAt: number };

/** La conversazione: i messaggi di chi guarda a destra, gli altri a sinistra. */
export function Thread({ messages, me }: { messages: TicketMessage[]; me: "client" | "admin" }) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length]);
  return (
    <ol className="space-y-3" aria-label="Conversazione">
      {messages.map((m) => {
        const mine = m.author === me;
        return (
          <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted"}`}>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className={`mt-1.5 text-[11px] ${mine ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                {m.author === "admin" ? "CORE829" : "Cliente"} · {formatDateTime(m.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
      <li ref={end} aria-hidden />
    </ol>
  );
}

/** Casella di risposta (portale: solo «Invia»; admin: anche «Invia e chiudi»). */
export function ReplyBox({ onSend, canClose, disabled }: { onSend: (body: string, close: boolean) => Promise<void>; canClose?: boolean; disabled?: boolean }) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(close: boolean, event?: FormEvent) {
    event?.preventDefault();
    if (!body.trim()) return;
    setPending(true);
    try {
      await onSend(body, close);
      setBody("");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={(e) => void submit(false, e)} className="grid gap-4">
      <Field id="ticket-reply" label="La tua risposta">
        <Textarea id="ticket-reply" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={3} disabled={disabled || pending} placeholder="Scrivi qui…" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={disabled || pending || !body.trim()}>
          {pending ? "Invio…" : "Invia"}
        </Button>
        {canClose ? (
          <Button type="button" variant="outline" disabled={disabled || pending || !body.trim()} onClick={() => void submit(true)}>
            <Check aria-hidden /> Invia e chiudi
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** Modulo «Nuova richiesta» del portale. */
export function NewTicketForm({ onCreate, onCancel, relatable }: { onCreate: (v: { subject: string; category: TicketCategory; body: string } & TicketRelatedIds) => Promise<void>; onCancel: () => void; relatable?: Relatable }) {
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setPending(true);
    try {
      // «Riguarda» e' un'unica scelta con prefisso: inv: / sub: / prj:
      const about = String(f.get("about") ?? "");
      const [kind, id] = about.split(":");
      await onCreate({
        subject: String(f.get("subject") ?? ""),
        category: String(f.get("category")) as TicketCategory,
        body: String(f.get("body") ?? ""),
        ...(id && kind === "inv" ? { invoiceId: id } : {}),
        ...(id && kind === "sub" ? { subscriptionId: id } : {}),
        ...(id && kind === "prj" ? { projectId: id } : {}),
      });
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10 shadow-(--shadow-soft)">
      <Field id="subject" label="Oggetto" hint="In poche parole: di cosa hai bisogno?">
        <Input id="subject" name="subject" required minLength={3} maxLength={120} autoFocus />
      </Field>
      <Field id="category" label="Tipo di richiesta">
        <NativeSelect id="category" name="category" defaultValue="question">
          {(Object.keys(CATEGORY_LABEL) as TicketCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {relatable && relatable.invoices.length + relatable.subscriptions.length + relatable.projects.length > 0 ? (
        <Field id="about" label="Riguarda (facoltativo)" hint="Se la richiesta è su un pagamento, un abbonamento o un progetto, sceglilo: ci aiuta a risponderti più in fretta.">
          <NativeSelect id="about" name="about" defaultValue="">
            <option value="">Niente di specifico</option>
            {relatable.invoices.length > 0 ? (
              <optgroup label="Pagamenti">
                {relatable.invoices.map((x) => (
                  <option key={x.id} value={`inv:${x.id}`}>
                    {x.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {relatable.subscriptions.length > 0 ? (
              <optgroup label="Abbonamenti">
                {relatable.subscriptions.map((x) => (
                  <option key={x.id} value={`sub:${x.id}`}>
                    {x.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {relatable.projects.length > 0 ? (
              <optgroup label="Progetti">
                {relatable.projects.map((x) => (
                  <option key={x.id} value={`prj:${x.id}`}>
                    {x.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </NativeSelect>
        </Field>
      ) : null}
      <Field id="body" label="Messaggio" hint="Più dettagli ci dai, più in fretta risolviamo.">
        <Textarea id="body" name="body" required minLength={3} maxLength={4000} rows={5} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Invio…" : "Invia la richiesta"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
