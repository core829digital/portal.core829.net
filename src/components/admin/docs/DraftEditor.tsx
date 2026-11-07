"use client";

import { useAction, useQuery } from "convex/react";
import { CheckSquare, Download, Eye, FileText, Pencil, Plus, RotateCcw, Save, Send, Square, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { DocField, DocParagraph } from "@convex/lib/docx";
import { Field, TextField } from "@/components/admin/Field";
import { PageHeader } from "@/components/dash/DashShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { composePreview, remainingFields, type PreviewBlock } from "@/lib/docPreview";
import { toast } from "@/lib/toast";
import { cn } from "cn";

const PAGE_SIZE = 40;

type Content = { paragraphs: DocParagraph[]; fields: DocField[] };

export type SendInput = { to: string; subject: string; message: string; formats: ("pdf" | "docx")[] };

export function SendDialog({
  pdfOnly = false,
  defaultTo,
  defaultSubject,
  clientName,
  onClose,
  onSend,
  beforeSend,
}: {
  /** Per i PDF caricati esiste solo il PDF (nessuna versione Word da allegare). */
  pdfOnly?: boolean;
  defaultTo: string;
  defaultSubject: string;
  clientName: string;
  onClose: () => void;
  onSend: (input: SendInput) => Promise<void>;
  beforeSend: () => Promise<boolean>;
}) {
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const formats: ("pdf" | "docx")[] = pdfOnly ? ["pdf"] : (["pdf", "docx"] as const).filter((f) => form.get(f) === "on");
    if (formats.length === 0) return void toast.error("Scegli almeno un formato da allegare.");
    setPending(true);
    try {
      if (!(await beforeSend())) return;
      await onSend({
        to: String(form.get("to") ?? ""),
        subject: String(form.get("subject") ?? ""),
        message: String(form.get("message") ?? ""),
        formats,
      });
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Invio non riuscito. Il documento non è stato inviato: riprova."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invia a {clientName}</DialogTitle>
          <DialogDescription>
            L&apos;email parte da CORE829 con il documento in allegato. Dopo l&apos;invio il documento entra nel fascicolo del cliente e non si può più modificare.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <TextField id="to" label="Destinatario" type="email" defaultValue={defaultTo} required />
          <TextField id="subject" label="Oggetto" defaultValue={defaultSubject} maxLength={150} required />
          <Field id="message" label="Messaggio">
            <Textarea
              id="message"
              name="message"
              rows={6}
              maxLength={4000}
              defaultValue={`Buongiorno,\n\nin allegato trova il documento «${defaultSubject}» da leggere e firmare. Per qualsiasi dubbio risponda pure a questa email.\n\nCordiali saluti,\nCORE829 SRL`}
            />
          </Field>
          {pdfOnly ? (
            <p className="text-sm text-muted-foreground">In allegato: il PDF con i testi che hai aggiunto.</p>
          ) : (
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="mb-1 text-sm font-medium">Allegati</legend>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="pdf" defaultChecked className="size-4" /> PDF
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="docx" className="size-4" /> Word (modificabile)
              </label>
            </fieldset>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Annulla
            </Button>
            <Button type="submit" disabled={pending}>
              <Send aria-hidden /> {pending ? "Invio…" : "Invia ora"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type DraftMeta = {
  name: string;
  status: "draft" | "sent";
  sentAt: number | null;
  sentTo: string | null;
  client: { id: string; displayName: string; email: string } | null;
};

export type SavePayload = {
  edits: { index: number; text: string }[];
  deletes: number[];
  inserts: { after: number; texts: string[] }[];
  fills: { id: string; value: string }[];
};

/** Vista dell'editor: tutto lo stato delle modifiche sta qui; i dati e le azioni arrivano dal contenitore. */
/** Il documento come sara' dopo il salvataggio, aggiornato a ogni tasto. Clic su un campo = si va a compilarlo; clic su un testo = si modifica. */
function PreviewPane({ blocks, locked, onField, onParagraph }: { blocks: PreviewBlock[]; locked: boolean; onField: (fieldId: string) => void; onParagraph: (index: number) => void }) {
  return (
    <article aria-label="Anteprima del documento" className="mx-auto w-full max-w-[52rem] rounded-2xl bg-white p-6 text-[13.5px] leading-relaxed text-neutral-900 ring-1 ring-foreground/10 shadow-(--shadow-soft) sm:p-10 dark:bg-white">
      {blocks.length === 0 ? <p className="text-sm text-neutral-500">Il documento è vuoto.</p> : null}
      {blocks.map((b, i) => {
        const heading = b.style !== null && /^(title|heading|titolo|intestazione)/i.test(b.style);
        return (
          <div
            key={`${b.index ?? "n"}-${b.insertedAfter ?? ""}-${i}`}
            data-testid="preview-block"
            className={cn(
              "min-w-0 whitespace-pre-wrap break-words py-0.5",
              heading && "mt-4 font-display text-base font-semibold tracking-tight",
              b.inTable && "ml-1 border-l-2 border-neutral-200 pl-3",
              b.edited && "bg-amber-50/70",
            )}
          >
            {b.segments.length === 0 ? <span className="select-none">&nbsp;</span> : null}
            {b.segments.map((s, j) =>
              s.type === "text" ? (
                <span
                  key={j}
                  onClick={!locked && b.index !== null ? () => onParagraph(b.index as number) : undefined}
                  className={!locked && b.index !== null ? "cursor-text" : undefined}
                >
                  {s.text}
                </span>
              ) : (
                <button
                  key={j}
                  type="button"
                  data-field={s.fieldId}
                  data-filled={s.filled}
                  onClick={() => onField(s.fieldId)}
                  title={s.filled ? "Compilato: clic per modificare" : "Da compilare"}
                  className={cn(
                    "mx-0.5 inline rounded px-1 align-baseline font-medium ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1",
                    s.filled ? "bg-emerald-50 text-emerald-900 ring-emerald-300 hover:bg-emerald-100" : "bg-brand/10 text-[#a8121f] ring-brand/40 hover:bg-brand/20",
                  )}
                >
                  {s.text}
                </button>
              ),
            )}
          </div>
        );
      })}
    </article>
  );
}

export function DraftEditorView({
  draft,
  content,
  onSave,
  onOpen,
  onSend,
}: {
  draft: DraftMeta;
  content: Content;
  onSave: (payload: SavePayload) => Promise<boolean>;
  onOpen: (format: "pdf" | "docx") => Promise<void>;
  onSend: (input: SendInput) => Promise<void>;
}) {
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [deletes, setDeletes] = useState<Set<number>>(new Set());
  const [inserts, setInserts] = useState<Record<number, string[]>>({});
  const [fills, setFills] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [fieldSearch, setFieldSearch] = useState("");
  const [onlyFields, setOnlyFields] = useState(false);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<"save" | "pdf" | "docx" | null>(null);
  const [sending, setSending] = useState(false);
  const [view, setView] = useState<"preview" | "text">("preview");

  const locked = draft.status === "sent";
  const dirty = Object.keys(edits).length + deletes.size + Object.keys(inserts).length + Object.values(fills).filter((v) => v !== "").length > 0;

  const fieldsByParagraph = useMemo(() => {
    const m = new Map<number, number>();
    for (const f of content?.fields ?? []) m.set(f.paragraph, (m.get(f.paragraph) ?? 0) + 1);
    return m;
  }, [content]);

  const filteredParagraphs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (content?.paragraphs ?? []).filter((p) => (onlyFields ? fieldsByParagraph.has(p.index) : true) && (q === "" ? true : (edits[p.index] ?? p.text).toLowerCase().includes(q)));
  }, [content, search, onlyFields, fieldsByParagraph, edits]);
  const pages = Math.max(1, Math.ceil(filteredParagraphs.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = filteredParagraphs.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const visibleFields = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase();
    return (content?.fields ?? []).filter((f) => q === "" || `${f.label} ${f.token} ${f.context}`.toLowerCase().includes(q));
  }, [content, fieldSearch]);
  const state = useMemo(() => ({ edits, deletes, inserts, fills }), [edits, deletes, inserts, fills]);
  const blocks = useMemo(() => composePreview(content.paragraphs, content.fields, state), [content, state]);
  const missing = useMemo(() => remainingFields(content.fields, state).length, [content, state]);

  function goToField(fieldId: string) {
    setFieldSearch("");
    window.requestAnimationFrame(() => {
      const el = document.getElementById(`f-${fieldId}`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
    });
  }
  function goToParagraph(index: number) {
    setView("text");
    setSearch("");
    setOnlyFields(false);
    setPage(Math.floor(index / PAGE_SIZE));
    window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLTextAreaElement>(`textarea[aria-label="Paragrafo ${index + 1}"]`);
      el?.scrollIntoView({ block: "center" });
      el?.focus({ preventScroll: true });
    });
  }
  const filledCount = (content?.fields ?? []).filter((f) => (fills[f.id] ?? "") !== "").length;

  async function save(): Promise<boolean> {
    if (!dirty) return true;
    setBusy("save");
    try {
      return await onSave({
        edits: Object.entries(edits).map(([index, text]) => ({ index: Number(index), text })),
        deletes: [...deletes],
        inserts: Object.entries(inserts).map(([after, texts]) => ({ after: Number(after), texts: texts.filter((t) => t.trim() !== "") })),
        fills: Object.entries(fills).filter(([, value]) => value !== "").map(([id, value]) => ({ id, value })),
      });
    } finally {
      setBusy(null);
    }
  }

  async function open(format: "pdf" | "docx") {
    if (!(await save())) return;
    setBusy(format);
    try {
      await onOpen(format);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        kicker={draft.client ? `Documento per ${draft.client.displayName}` : "Documento"}
        title={draft.name}
        description={
          locked ? (
            <span>
              Inviato il {formatDateTime(draft.sentAt)} a {draft.sentTo}. Non si può più modificare: lo trovi nel{" "}
              {draft.client ? (
                <Link href={`/admin/clients/${draft.client.id}/documents`} className="underline underline-offset-4">
                  fascicolo del cliente
                </Link>
              ) : (
                "fascicolo del cliente"
              )}
              .
            </span>
          ) : (
            "Compila i campi, correggi il testo, guarda l'anteprima e invia al cliente."
          )
        }
        actions={
          <>
            {dirty ? <Badge variant="secondary">Modifiche non salvate</Badge> : null}
            {!locked && missing > 0 ? <Badge variant="outline">{missing} {missing === 1 ? "campo vuoto" : "campi vuoti"}</Badge> : null}
            {!locked ? (
              <Button variant="outline" onClick={() => void save()} disabled={busy !== null || !dirty}>
                <Save aria-hidden /> {busy === "save" ? "Salvataggio…" : "Salva"}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => void open("pdf")} disabled={busy !== null}>
              <Eye aria-hidden /> {busy === "pdf" ? "Genero…" : "Anteprima PDF"}
            </Button>
            <Button variant="outline" onClick={() => void open("docx")} disabled={busy !== null}>
              <Download aria-hidden /> Word
            </Button>
            {!locked ? (
              <Button onClick={() => setSending(true)} disabled={busy !== null}>
                <Send aria-hidden /> Invia al cliente
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section aria-label="Campi da compilare" className="reveal h-fit min-w-0 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 shadow-(--shadow-soft) lg:sticky lg:top-4">
          <h2 className="font-display text-base tracking-tight">Campi da compilare</h2>
          <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
            {content.fields.length === 0 ? "Nessun campo da compilare in questo documento." : `${filledCount} compilati su ${content.fields.length}${missing > 0 ? ` · ${missing} ancora da compilare` : " · tutto compilato"}`}
          </p>
          {content.fields.length > 8 ? (
            <Input type="search" aria-label="Cerca tra i campi" placeholder="Cerca un campo" value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)} className="mt-3" />
          ) : null}
          <ul className="mt-3 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {visibleFields.map((f) => {
              const rewritten = Object.prototype.hasOwnProperty.call(edits, f.paragraph);
              const value = fills[f.id] ?? "";
              return (
                <li key={f.id} className="grid gap-1">
                  <label htmlFor={`f-${f.id}`} className="text-xs font-medium">
                    {f.kind === "variable" ? `{{${f.key}}}` : f.label}
                    <span className="ml-1 font-mono text-[10px] text-muted-foreground">{f.token.length > 18 ? `${f.token.slice(0, 18)}…` : f.token}</span>
                  </label>
                  {f.kind === "checkbox" ? (
                    <button
                      id={`f-${f.id}`}
                      type="button"
                      role="checkbox"
                      aria-checked={value === "true"}
                      disabled={locked || rewritten}
                      onClick={() => setFills((s) => ({ ...s, [f.id]: s[f.id] === "true" ? "" : "true" }))}
                      className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-left text-sm ring-1 ring-foreground/10 hover:bg-muted disabled:opacity-50"
                    >
                      {value === "true" ? <CheckSquare aria-hidden className="size-4 text-brand" /> : <Square aria-hidden className="size-4" />}
                      <span className="truncate">{f.label}</span>
                    </button>
                  ) : (
                    <Input id={`f-${f.id}`} value={value} disabled={locked || rewritten} maxLength={2000} onChange={(e) => setFills((s) => ({ ...s, [f.id]: e.target.value }))} />
                  )}
                  {rewritten ? <p className="text-[11px] text-muted-foreground">Hai riscritto a mano il paragrafo: compila da lì.</p> : null}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-label="Documento" className="reveal min-w-0 space-y-3" style={{ "--i": 1 } as React.CSSProperties}>
          <div role="tablist" aria-label="Modo di visualizzazione" className="flex w-fit gap-1 rounded-xl bg-muted p-1">
            <button type="button" role="tab" aria-selected={view === "preview"} onClick={() => setView("preview")} className={cn("flex min-h-8 items-center gap-1.5 rounded-lg px-3 text-sm", view === "preview" ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>
              <FileText aria-hidden className="size-4" /> Anteprima live
            </button>
            <button type="button" role="tab" aria-selected={view === "text"} onClick={() => setView("text")} className={cn("flex min-h-8 items-center gap-1.5 rounded-lg px-3 text-sm", view === "text" ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>
              <Pencil aria-hidden className="size-4" /> Modifica il testo
            </button>
          </div>
          {view === "preview" ? (
            <>
              <p className="text-xs text-muted-foreground">
                Si aggiorna mentre scrivi. <span className="rounded bg-brand/10 px-1 text-[#a8121f]">Rosso</span> = da compilare, <span className="rounded bg-emerald-50 px-1 text-emerald-900">verde</span> = compilato,{" "}
                <span className="rounded bg-amber-50 px-1 text-amber-900">giallo</span> = testo che hai modificato. Clicca su un campo per compilarlo{!locked ? ", su un testo per correggerlo" : ""}.
              </p>
              <PreviewPane blocks={blocks} locked={locked} onField={goToField} onParagraph={goToParagraph} />
            </>
          ) : null}
          <div className={cn("flex flex-wrap items-center gap-3 rounded-2xl bg-card p-3 ring-1 ring-foreground/10", view !== "text" && "hidden")}>
            <Input
              type="search"
              aria-label="Cerca nel testo"
              placeholder="Cerca nel testo"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="max-w-xs"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={onlyFields}
                onChange={(e) => {
                  setOnlyFields(e.target.checked);
                  setPage(0);
                }}
              />
              Solo paragrafi con campi
            </label>
            <span className="ml-auto text-xs text-muted-foreground">{filteredParagraphs.length} paragrafi</span>
          </div>

          <ol className={cn("space-y-2", view !== "text" && "hidden")}>
            {visible.map((p) => {
              const removed = deletes.has(p.index);
              const current = edits[p.index] ?? p.text;
              const changed = Object.prototype.hasOwnProperty.call(edits, p.index);
              return (
                <li key={p.index} className={cn("min-w-0 rounded-xl bg-card p-3 ring-1", changed ? "ring-primary/50" : "ring-foreground/10", removed && "opacity-50")}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-mono">#{p.index + 1}</span>
                    {p.style ? <Badge variant="outline">{p.style}</Badge> : null}
                    {p.inTable ? <Badge variant="outline">tabella{p.rowLabel ? ` · ${p.rowLabel}` : ""}</Badge> : null}
                    {fieldsByParagraph.has(p.index) ? <Badge variant="secondary">{fieldsByParagraph.get(p.index)} campi</Badge> : null}
                    {!locked ? (
                      <span className="ml-auto flex gap-1">
                        {changed || removed ? (
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Ripristina il paragrafo ${p.index + 1}`}
                            onClick={() => {
                              setEdits((s) => Object.fromEntries(Object.entries(s).filter(([k]) => Number(k) !== p.index)));
                              setDeletes((s) => new Set([...s].filter((i) => i !== p.index)));
                            }}
                          >
                            <RotateCcw aria-hidden />
                          </Button>
                        ) : null}
                        <Button size="icon-xs" variant="ghost" aria-label={`Aggiungi un paragrafo dopo il ${p.index + 1}`} onClick={() => setInserts((s) => ({ ...s, [p.index]: [...(s[p.index] ?? []), ""] }))}>
                          <Plus aria-hidden />
                        </Button>
                        <Button size="icon-xs" variant="ghost" aria-label={`Elimina il paragrafo ${p.index + 1}`} onClick={() => setDeletes((s) => new Set([...s, p.index]))}>
                          <Trash2 aria-hidden />
                        </Button>
                      </span>
                    ) : null}
                  </div>
                  <Textarea
                    aria-label={`Paragrafo ${p.index + 1}`}
                    value={current}
                    disabled={locked || removed}
                    rows={Math.min(10, Math.max(1, Math.ceil(current.length / 95) + (current.includes("\n") ? current.split("\n").length - 1 : 0)))}
                    maxLength={20000}
                    className={cn("min-h-0 resize-y text-sm", removed && "line-through")}
                    onChange={(e) => {
                      const value = e.target.value;
                      setEdits((s) => {
                        const next = { ...s };
                        if (value === p.text) delete next[p.index];
                        else next[p.index] = value;
                        return next;
                      });
                    }}
                  />
                  {(inserts[p.index] ?? []).map((text, i) => (
                    <div key={i} className="mt-2 flex items-start gap-2">
                      <Textarea
                        aria-label={`Nuovo paragrafo ${i + 1} dopo il ${p.index + 1}`}
                        value={text}
                        rows={2}
                        maxLength={20000}
                        placeholder="Testo del nuovo paragrafo"
                        className="min-h-0 resize-y text-sm"
                        onChange={(e) => setInserts((s) => ({ ...s, [p.index]: (s[p.index] ?? []).map((t, j) => (j === i ? e.target.value : t)) }))}
                      />
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Togli il nuovo paragrafo"
                        onClick={() =>
                          setInserts((s) => {
                            const rest = (s[p.index] ?? []).filter((_, j) => j !== i);
                            const next = { ...s };
                            if (rest.length === 0) delete next[p.index];
                            else next[p.index] = rest;
                            return next;
                          })
                        }
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  ))}
                </li>
              );
            })}
          </ol>

          {pages > 1 && view === "text" ? (
            <nav aria-label="Pagine del documento" className="flex items-center justify-between gap-3">
              <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                Precedente
              </Button>
              <span className="text-sm text-muted-foreground">
                Pagina {safePage + 1} di {pages}
              </span>
              <Button variant="outline" size="sm" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>
                Successiva
              </Button>
            </nav>
          ) : null}
        </section>
      </div>

      {sending && draft.client ? (
        <SendDialog
          defaultTo={draft.client.email}
          defaultSubject={draft.name}
          clientName={draft.client.displayName}
          onClose={() => setSending(false)}
          onSend={onSend}
          beforeSend={save}
        />
      ) : null}
    </>
  );
}


/** Contenitore: legge il documento dal server e collega salvataggio, anteprima e invio. */
export function DraftEditor({ draftId }: { draftId: Id<"docDrafts"> }) {
  const draft = useQuery(api.docStudio.getDraft, { draftId });
  const inspect = useAction(api.docStudioActions.inspectDraft);
  const saveDraft = useAction(api.docStudioActions.saveDraft);
  const previewDraft = useAction(api.docStudioActions.previewDraft);
  const sendDraft = useAction(api.docStudioActions.sendDraft);

  const [content, setContent] = useState<Content | null>(null);
  const [version, setVersion] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    inspect({ draftId })
      .then((result) => {
        if (!cancelled) setContent(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorMessage(error, "Non riesco ad aprire il documento."));
      });
    return () => {
      cancelled = true;
    };
  }, [inspect, draftId]);

  const onSave = useCallback(
    async (payload: SavePayload): Promise<boolean> => {
      try {
        await saveDraft({ draftId, ...payload });
        setContent(await inspect({ draftId }));
        setVersion((v) => v + 1); // riparte l'editor con il testo salvato
        toast.success("Documento salvato.");
        return true;
      } catch (error) {
        toast.error(errorMessage(error, "Salvataggio non riuscito. Riprova."));
        return false;
      }
    },
    [saveDraft, inspect, draftId],
  );

  const onOpen = useCallback(
    async (format: "pdf" | "docx") => {
      try {
        const { url } = await previewDraft({ draftId, format });
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (error) {
        toast.error(errorMessage(error, "Non riesco a generare il file."));
      }
    },
    [previewDraft, draftId],
  );

  const onSend = useCallback(
    async (input: SendInput) => {
      const result = await sendDraft({ draftId, ...input });
      toast.success(`Email inviata a ${result.sentTo} con ${result.attachments} ${result.attachments === 1 ? "allegato" : "allegati"}.`);
    },
    [sendDraft, draftId],
  );

  if (loadError) return <p role="alert" className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-destructive">{loadError}</p>;
  if (draft === undefined || content === null) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Caricamento">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }
  if (draft === null) return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Documento non trovato.</p>;

  return <DraftEditorView key={version} draft={draft} content={content} onSave={onSave} onOpen={onOpen} onSend={onSend} />;
}
