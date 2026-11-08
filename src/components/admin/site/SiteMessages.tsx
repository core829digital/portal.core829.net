"use client";

import { useMutation, useQuery } from "convex/react";
import { Mail, RotateCw, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { PageHeader } from "@/components/dash/DashShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { COMPANY } from "@/lib/company";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";

type Status = Doc<"siteMessages">["status"];
const FILTERS: { value: Status | "all"; label: string }[] = [
  { value: "new", label: "Da gestire" },
  { value: "handled", label: "Gestite" },
  { value: "spam", label: "Spam" },
  { value: "all", label: "Tutte" },
];

/** Collegamento «scrivi a»: l'indirizzo e' codificato, cosi' non puo' aggiungere intestazioni (cc, bcc...) al messaggio. */
const reply = (email: string) => `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}?subject=${encodeURIComponent("Re: la tua richiesta a CORE829")}`;

const OFFICIAL = COMPANY.emailSupport;

/** Cronologia delle risposte gia' inviate a una richiesta (con stato e possibilita' di riprovare). */
function Replies({ messageId }: { messageId: Doc<"siteMessages">["_id"] }) {
  const replies = useQuery(api.site.repliesFor, { messageId });
  const retry = useMutation(api.site.retryReply);
  if (!replies || replies.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2 border-l-2 border-primary/30 pl-3" aria-label="Risposte inviate">
      {replies.map((r) => (
        <li key={r.id} className="text-xs">
          <p className="font-medium">
            {r.subject} <span className="font-normal text-muted-foreground">· {r.status === "sent" ? `inviata il ${formatDateTime(r.sentAt)}` : r.status === "queued" ? "in invio…" : "NON inviata"}</span>
            {r.status === "failed" ? (
              <button type="button" className="ml-2 inline-flex items-center gap-1 underline underline-offset-4" onClick={() => void retry({ replyId: r.id }).then(() => toast.success("Riprovo l'invio.")).catch((e: unknown) => toast.error(errorMessage(e)))}>
                <RotateCw aria-hidden className="size-3" /> Riprova
              </button>
            ) : null}
          </p>
          <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-muted-foreground">{r.body}</p>
        </li>
      ))}
    </ul>
  );
}

/** Finestra per rispondere: l'email parte da clients@core829.net e invita a rispondere all'indirizzo ufficiale. */
function ReplyDialog({ message, onClose }: { message: { id: Doc<"siteMessages">["_id"]; name: string; email: string }; onClose: () => void }) {
  const send = useMutation(api.site.reply);
  const [subject, setSubject] = useState("Re: la tua richiesta a CORE829");
  const [body, setBody] = useState(`Buongiorno ${message.name},\n\ngrazie per averci scritto. \n\n\nCordiali saluti,\nCORE829 SRL`);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      await send({ messageId: message.id, subject, body });
      toast.success(`Email in invio a ${message.email}.`);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Rispondi a {message.name}</DialogTitle>
          <DialogDescription>
            Da: <strong>CORE829 &lt;clients@core829.net&gt;</strong> · A: <strong>{message.email}</strong>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="reply-subject" className="text-sm font-medium">Oggetto</label>
            <Input id="reply-subject" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="reply-body" className="text-sm font-medium">Messaggio</label>
            <Textarea id="reply-body" rows={9} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} required />
          </div>
          <p className="rounded-xl bg-muted p-3 text-xs leading-5 text-muted-foreground" aria-label="Avviso aggiunto in fondo all'email">
            <strong>In fondo all&apos;email aggiungiamo in automatico:</strong> «Questa email è stata inviata da un indirizzo di sola uscita (clients@core829.net) che non viene letto. Per rispondere scrivi a {OFFICIAL}, l&apos;indirizzo ufficiale di CORE829 che trovi anche nel footer di core829.net.» Le risposte del cliente arrivano a {OFFICIAL} e una copia nascosta dell&apos;invio resta nella stessa casella.
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Annulla
            </Button>
            <Button type="submit" disabled={pending}>
              <Mail aria-hidden /> {pending ? "Invio…" : "Invia email"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Richieste arrivate dal modulo contatti di core829.net. Si possono trasformare in un cliente con un clic. */
export function SiteMessages() {
  const router = useRouter();
  const [filter, setFilter] = useState<Status | "all">("new");
  const rows = useQuery(api.site.messages, filter === "all" ? {} : { status: filter });
  const setStatus = useMutation(api.site.setMessageStatus);
  const remove = useMutation(api.site.removeMessage);
  const toClient = useMutation(api.site.messageToClient);
  const [replyTo, setReplyTo] = useState<{ id: Doc<"siteMessages">["_id"]; name: string; email: string } | null>(null);
  const [toDelete, setToDelete] = useState<{ id: Doc<"siteMessages">["_id"]; name: string } | null>(null);

  return (
    <>
      <PageHeader kicker="Sito core829.net" title="Richieste dal sito" description="I messaggi del modulo contatti (ti arrivano anche per email). «Crea cliente» apre la scheda con tutti i dati e le note." />
      <div role="group" aria-label="Filtro" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Button key={f.value} size="sm" variant={filter === f.value ? "default" : "outline"} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </Button>
        ))}
      </div>
      {rows === undefined ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Nessuna richiesta in questo elenco.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 shadow-(--shadow-soft)">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="font-medium">{m.name}</p>
                {m.company ? <span className="text-sm text-muted-foreground">{m.company}</span> : null}
                <a href={reply(m.email)} className="text-sm underline underline-offset-4">
                  {m.email}
                </a>
                <Badge variant={m.status === "new" ? "default" : "secondary"}>{m.status === "new" ? "Nuova" : m.status === "handled" ? "Gestita" : "Spam"}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDateTime(m.createdAt)}
                  {m.locale ? ` · ${m.locale}` : ""}
                </span>
              </div>
              {m.service || m.budget ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {m.service ? `Servizio: ${m.service}` : ""}
                  {m.service && m.budget ? " · " : ""}
                  {m.budget ? `Budget: ${m.budget}` : ""}
                </p>
              ) : null}
              {/* Testo del visitatore: sempre mostrato come testo, mai come HTML. */}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{m.message}</p>
              <Replies messageId={m.id} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setReplyTo({ id: m.id, name: m.name, email: m.email })}>
                  <Mail aria-hidden /> Rispondi
                </Button>
                {m.clientId ? (
                  <Button size="sm" variant="outline" onClick={() => router.push(`/admin/clients/${m.clientId}`)}>
                    Apri il cliente
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      void toClient({ messageId: m.id })
                        .then((id) => {
                          toast.success("Cliente creato.");
                          router.push(`/admin/clients/${id}`);
                        })
                        .catch((e: unknown) => toast.error(errorMessage(e)));
                    }}
                  >
                    <UserPlus aria-hidden /> Crea cliente
                  </Button>
                )}
                {m.status !== "handled" ? (
                  <Button size="sm" variant="ghost" onClick={() => void setStatus({ messageId: m.id, status: "handled" }).catch((e: unknown) => toast.error(errorMessage(e)))}>
                    Segna come gestita
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => void setStatus({ messageId: m.id, status: "new" }).catch((e: unknown) => toast.error(errorMessage(e)))}>
                    Rimetti da gestire
                  </Button>
                )}
                {m.status !== "spam" ? (
                  <Button size="sm" variant="ghost" onClick={() => void setStatus({ messageId: m.id, status: "spam" }).catch((e: unknown) => toast.error(errorMessage(e)))}>
                    Spam
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setToDelete({ id: m.id, name: m.name })}>
                  <Trash2 aria-hidden /> Elimina
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {replyTo ? <ReplyDialog message={replyTo} onClose={() => setReplyTo(null)} /> : null}
      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminare la richiesta?"
        description={`La richiesta di ${toDelete?.name ?? ""} verrà cancellata per sempre (contiene dati personali: eliminala quando non serve più).`}
        confirmLabel="Elimina"
        destructive
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const d = toDelete;
          setToDelete(null);
          if (d) void remove({ messageId: d.id }).then(() => toast.success("Richiesta eliminata.")).catch((e: unknown) => toast.error(errorMessage(e)));
        }}
      />
    </>
  );
}
