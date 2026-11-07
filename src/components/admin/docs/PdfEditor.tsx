"use client";

import { useAction, useQuery } from "convex/react";
import { Bold, Eye, GripVertical, Plus, Save, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { LINE_HEIGHT, MAX_SIZE, MIN_SIZE, type AnnotationColor, type PdfAnnotation } from "@convex/lib/pdfAnnotations";
import { SendDialog, type DraftMeta, type SendInput } from "@/components/admin/docs/DraftEditor";
import { NativeSelect } from "@/components/admin/Field";
import { PageHeader } from "@/components/dash/DashShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { COMPANY } from "@convex/lib/autofill";
import { toast } from "@/lib/toast";
import { cn } from "cn";

type PageSize = { width: number; height: number };
type Note = PdfAnnotation & { id: string };

const COLOR_CSS: Record<AnnotationColor, string> = { black: "#141414", graphite: "#4a4a4a", red: "#dd1a2b", blue: "#1a40b3" };
const COLOR_LABEL: Record<AnnotationColor, string> = { black: "Nero", graphite: "Grigio", red: "Rosso", blue: "Blu" };
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 24, 32];

let counter = 0;
const uid = () => `n${Date.now().toString(36)}${(counter++).toString(36)}`;
const strip = (notes: Note[]): PdfAnnotation[] => notes.map(({ page, x, y, text, size, color, bold }) => ({ page, x, y, text, size, color, bold }));
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Una pagina del PDF disegnata su canvas con pdf.js (caricato solo quando serve). */
function PdfCanvas({ doc, pageIndex, width, height }: { doc: PdfDocumentLike; pageIndex: number; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    (async () => {
      const page = await doc.getPage(pageIndex + 1);
      const canvas = ref.current;
      if (cancelled || !canvas) return;
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvas, viewport });
      await task.promise.catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageIndex, width]);
  return <canvas ref={ref} role="img" aria-label={`Pagina ${pageIndex + 1} del PDF`} style={{ width, height }} className="block bg-white" />;
}

type PdfDocumentLike = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvas: HTMLCanvasElement; viewport: unknown }) => { cancel: () => void; promise: Promise<unknown> };
  }>;
};

export type PdfEditorViewProps = {
  draft: DraftMeta;
  pdfUrl: string;
  pages: PageSize[];
  initial: PdfAnnotation[];
  /** Testi pronti da inserire con un clic (es. nome del cliente, data di oggi). */
  quickTexts: { label: string; value: string }[];
  onSave: (annotations: PdfAnnotation[]) => Promise<boolean>;
  onOpen: () => Promise<void>;
  onSend: (input: SendInput) => Promise<void>;
};

/** Editor PDF: la pagina a sinistra al centro, i testi si aggiungono con un clic e si spostano trascinandoli. */
export function PdfEditorView({ draft, pdfUrl, pages, initial, quickTexts, onSave, onOpen, onSend }: PdfEditorViewProps) {
  const [doc, setDoc] = useState<PdfDocumentLike | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>(() => initial.map((a) => ({ ...a, id: uid() })));
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [selected, setSelected] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [busy, setBusy] = useState<"save" | "open" | null>(null);
  const [sending, setSending] = useState(false);
  const [boxWidth, setBoxWidth] = useState(720);
  const container = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const locked = draft.status === "sent";

  // pdf.js si carica solo qui (e solo nel browser): e' una libreria grande, non serve al resto del portale.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const loaded = await pdfjs.getDocument({ url: pdfUrl }).promise;
      if (!cancelled) setDoc(loaded as unknown as PdfDocumentLike);
    })().catch(() => {
      if (!cancelled) setLoadError("Non riesco a mostrare il PDF. Riprova o ricarica la pagina.");
    });
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxWidth(Math.max(280, Math.min(900, Math.floor(el.clientWidth)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const page = pages[pageIndex];
  const scale = boxWidth / page.width;
  const boxHeight = Math.round(page.height * scale);
  const dirty = JSON.stringify(strip(notes)) !== saved;
  const current = notes.find((n) => n.id === selected) ?? null;
  const onPage = useMemo(() => notes.filter((n) => n.page === pageIndex), [notes, pageIndex]);

  const update = useCallback((id: string, patch: Partial<PdfAnnotation>) => setNotes((list) => list.map((n) => (n.id === id ? { ...n, ...patch } : n))), []);
  const add = useCallback(
    (x: number, y: number, text = "Testo", size = 12) => {
      const note: Note = { id: uid(), page: pageIndex, x: clamp(x, 0, 0.95), y: clamp(y, 0, 0.97), text, size, color: "black", bold: false };
      pendingFocus.current = note.id; // il campo di testo appena creato prende il cursore (vedi l'effetto sotto)
      setNotes((list) => [...list, note]);
      setSelected(note.id);
    },
    [pageIndex],
  );

  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    const el = container.current?.querySelector<HTMLTextAreaElement>(`textarea[data-note-id="${id}"]`);
    if (el) {
      pendingFocus.current = null;
      el.focus();
      el.select();
    }
  }, [notes]);

  async function save(): Promise<boolean> {
    if (!dirty) return true;
    setBusy("save");
    try {
      const payload = strip(notes).filter((n) => n.text.trim() !== "");
      if (!(await onSave(payload))) return false;
      setSaved(JSON.stringify(strip(notes)));
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function open() {
    if (!(await save())) return;
    setBusy("open");
    try {
      await onOpen();
    } finally {
      setBusy(null);
    }
  }

  function startDrag(event: React.PointerEvent<HTMLButtonElement>, note: Note) {
    event.preventDefault();
    setSelected(note.id);
    if (locked) return;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const { x, y } = note;
    const move = (e: PointerEvent) => update(note.id, { x: clamp(x + (e.clientX - startX) / boxWidth, 0, 0.98), y: clamp(y + (e.clientY - startY) / boxHeight, 0, 0.98) });
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  function nudge(event: React.KeyboardEvent<HTMLButtonElement>, note: Note) {
    const step = event.shiftKey ? 0.05 : 0.005;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[event.key];
    if (m && !locked) {
      event.preventDefault();
      update(note.id, { x: clamp(note.x + m[0], 0, 0.98), y: clamp(note.y + m[1], 0, 0.98) });
    }
    if ((event.key === "Delete" || event.key === "Backspace") && !locked) {
      event.preventDefault();
      setNotes((list) => list.filter((n) => n.id !== note.id));
      setSelected(null);
    }
  }

  return (
    <>
      <PageHeader
        kicker={draft.client ? `PDF per ${draft.client.displayName}` : "PDF"}
        title={draft.name}
        description={
          locked
            ? `Inviato il ${formatDateTime(draft.sentAt)} a ${draft.sentTo}. Non si può più modificare.`
            : "Clicca sulla pagina per aggiungere un testo, trascina la maniglia per spostarlo. Il PDF originale non viene modificato."
        }
        actions={
          <>
            {dirty ? <Badge variant="secondary">Modifiche non salvate</Badge> : null}
            {!locked ? (
              <Button variant="outline" onClick={() => void save()} disabled={busy !== null || !dirty}>
                <Save aria-hidden /> {busy === "save" ? "Salvataggio…" : "Salva"}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => void open()} disabled={busy !== null}>
              <Eye aria-hidden /> {busy === "open" ? "Genero…" : "Anteprima PDF"}
            </Button>
            {!locked ? (
              <Button onClick={() => setSending(true)} disabled={busy !== null}>
                <Send aria-hidden /> Invia al cliente
              </Button>
            ) : null}
          </>
        }
      />

      <div className="reveal flex flex-wrap items-center gap-3 rounded-2xl bg-card p-3 ring-1 ring-foreground/10" role="toolbar" aria-label="Strumenti del PDF">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={pageIndex === 0} onClick={() => setPageIndex(pageIndex - 1)}>
            Precedente
          </Button>
          <span className="text-sm tabular-nums" aria-live="polite">
            Pagina {pageIndex + 1} di {pages.length}
          </span>
          <Button variant="outline" size="sm" disabled={pageIndex >= pages.length - 1} onClick={() => setPageIndex(pageIndex + 1)}>
            Successiva
          </Button>
        </div>
        {!locked ? (
          <>
            <Button size="sm" onClick={() => add(0.1, 0.1)}>
              <Plus aria-hidden /> Aggiungi testo
            </Button>
            {quickTexts.map((q) => (
              <Button key={q.label} size="sm" variant="outline" onClick={() => add(0.1, 0.15, q.value)}>
                {q.label}
              </Button>
            ))}
          </>
        ) : null}
      </div>

      {notes.length > 0 ? (
        <details className="reveal rounded-2xl bg-card p-3 ring-1 ring-foreground/10" open={notes.length <= 12}>
          <summary className="cursor-pointer text-sm font-medium">
            Testi inseriti ({notes.length}) <span className="font-normal text-muted-foreground">· clic per andare al punto</span>
          </summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {[...notes]
              .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)
              .map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPageIndex(n.page);
                      setSelected(n.id);
                    }}
                    className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ring-1 hover:bg-muted", n.id === selected ? "bg-brand-tint ring-primary/40" : "ring-foreground/10")}
                  >
                    <span className="shrink-0 font-mono text-[10px] uppercase text-muted-foreground">p.{n.page + 1}</span>
                    <span className="truncate">{n.text || "(vuoto)"}</span>
                  </button>
                </li>
              ))}
          </ul>
        </details>
      ) : null}

      {current && !locked ? (
        <div className="reveal flex flex-wrap items-center gap-3 rounded-2xl bg-brand-tint p-3 ring-1 ring-primary/20" role="toolbar" aria-label="Testo selezionato">
          <label className="flex items-center gap-2 text-sm">
            Corpo
            <NativeSelect aria-label="Dimensione del testo" value={String(current.size)} onChange={(e) => update(current.id, { size: Number(e.target.value) })} className="w-20">
              {SIZES.filter((s) => s >= MIN_SIZE && s <= MAX_SIZE).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex items-center gap-2 text-sm">
            Colore
            <NativeSelect aria-label="Colore del testo" value={current.color} onChange={(e) => update(current.id, { color: e.target.value as AnnotationColor })} className="w-28">
              {(Object.keys(COLOR_LABEL) as AnnotationColor[]).map((c) => (
                <option key={c} value={c}>
                  {COLOR_LABEL[c]}
                </option>
              ))}
            </NativeSelect>
          </label>
          <Button size="sm" variant={current.bold ? "default" : "outline"} aria-pressed={current.bold} onClick={() => update(current.id, { bold: !current.bold })}>
            <Bold aria-hidden /> Grassetto
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setNotes((list) => list.filter((n) => n.id !== current.id));
              setSelected(null);
            }}
          >
            <Trash2 aria-hidden /> Elimina
          </Button>
          <p className="text-xs text-muted-foreground">Con la maniglia selezionata: frecce per spostare (Maiusc = più veloce), Canc per eliminare.</p>
        </div>
      ) : null}

      <div ref={container} className="reveal min-w-0 overflow-x-auto" style={{ "--i": 1 } as React.CSSProperties}>
        {loadError ? (
          <p role="alert" className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-destructive">
            {loadError}
          </p>
        ) : !doc ? (
          <div aria-busy="true" aria-label="Caricamento del PDF">
            <Skeleton className="mx-auto rounded-md" style={{ width: boxWidth, height: boxHeight }} />
          </div>
        ) : (
          <div
            data-testid="pdf-page"
            className="relative mx-auto bg-white shadow-(--shadow-lift) ring-1 ring-foreground/10"
            style={{ width: boxWidth, height: boxHeight, cursor: locked ? "default" : "crosshair" }}
            onClick={(e) => {
              if (locked || e.target !== e.currentTarget.querySelector("canvas")) return;
              const rect = e.currentTarget.getBoundingClientRect();
              add((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
            }}
          >
            <PdfCanvas doc={doc} pageIndex={pageIndex} width={boxWidth} height={boxHeight} />
            {onPage.map((n) => {
              const size = n.size * scale;
              const isSelected = n.id === selected;
              return (
                <div key={n.id} className="absolute" style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%` }}>
                  {!locked ? (
                    <button
                      type="button"
                      aria-label={`Sposta il testo «${n.text.slice(0, 30)}»`}
                      onPointerDown={(e) => startDrag(e, n)}
                      onKeyDown={(e) => nudge(e, n)}
                      onFocus={() => setSelected(n.id)}
                      className={cn(
                        "absolute -left-5 -top-5 flex size-5 touch-none cursor-grab items-center justify-center rounded-md bg-primary text-primary-foreground shadow",
                        isSelected ? "opacity-100" : "opacity-60 hover:opacity-100",
                      )}
                    >
                      <GripVertical aria-hidden className="size-3.5" />
                    </button>
                  ) : null}
                  <textarea
                    data-note-id={n.id}
                    aria-label={`Testo sulla pagina ${n.page + 1}`}
                    value={n.text}
                    readOnly={locked}
                    rows={Math.max(1, n.text.split("\n").length)}
                    maxLength={2000}
                    onFocus={() => setSelected(n.id)}
                    onChange={(e) => update(n.id, { text: e.target.value })}
                    spellCheck={false}
                    className={cn("field-sizing-content block resize-none overflow-hidden whitespace-pre border bg-transparent p-0 outline-none", isSelected ? "border-dashed border-primary" : "border-transparent hover:border-dashed hover:border-primary/50")}
                    style={{
                      fontFamily: "Helvetica, Arial, sans-serif",
                      fontSize: `${size}px`,
                      lineHeight: LINE_HEIGHT,
                      fontWeight: n.bold ? 700 : 400,
                      color: COLOR_CSS[n.color],
                      // Interlinea e carattere identici a quelli del PDF finale: la linea di base coincide (vedi BASELINE in pdfAnnotations).
                      minWidth: "3ch",
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {sending && draft.client ? (
        <SendDialog pdfOnly defaultTo={draft.client.email} defaultSubject={draft.name} clientName={draft.client.displayName} onClose={() => setSending(false)} onSend={onSend} beforeSend={save} />
      ) : null}
    </>
  );
}

/** Contenitore: legge il PDF dal server e collega salvataggio, anteprima e invio. */
export function PdfEditor({ draftId }: { draftId: Id<"docDrafts"> }) {
  const draft = useQuery(api.docStudio.getDraft, { draftId });
  const load = useAction(api.docStudioActions.pdfEditorData);
  const save = useAction(api.docStudioActions.savePdf);
  const preview = useAction(api.docStudioActions.previewDraft);
  const send = useAction(api.docStudioActions.sendDraft);
  const [data, setData] = useState<{ url: string; pages: PageSize[]; annotations: PdfAnnotation[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    load({ draftId })
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e, "Non riesco ad aprire il PDF."));
      });
    return () => {
      cancelled = true;
    };
  }, [load, draftId]);

  const onSave = useCallback(
    async (annotations: PdfAnnotation[]) => {
      try {
        await save({ draftId, annotations });
        toast.success("PDF salvato.");
        return true;
      } catch (e) {
        toast.error(errorMessage(e, "Salvataggio non riuscito. Riprova."));
        return false;
      }
    },
    [save, draftId],
  );
  const onOpen = useCallback(async () => {
    try {
      const { url } = await preview({ draftId, format: "pdf" });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(errorMessage(e, "Non riesco a generare il file."));
    }
  }, [preview, draftId]);
  const onSend = useCallback(
    async (input: SendInput) => {
      const result = await send({ draftId, ...input });
      toast.success(`Email inviata a ${result.sentTo} con ${result.attachments} ${result.attachments === 1 ? "allegato" : "allegati"}.`);
    },
    [send, draftId],
  );

  const quickTexts = useMemo(() => {
    const today = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" }).format(new Date());
    const c = draft?.client;
    const clientTexts: [string, string | null | undefined][] = [
      ["Nome cliente", c?.displayName],
      ["Referente", c?.contactName],
      ["Sede cliente", c?.address],
      ["P. IVA cliente", c?.vatId],
      ["PEC cliente", c?.pec],
      ["Email cliente", c?.email],
      ["Telefono cliente", c?.phone],
      ["Rappr. legale", c?.legalRep],
    ];
    return [
      ...clientTexts.filter((t): t is [string, string] => Boolean(t[1])).map(([label, value]) => ({ label, value })),
      { label: "Data di oggi", value: today },
      { label: "Roman, data", value: `${COMPANY.place}, ${today}` },
      { label: "CORE829 SRL", value: COMPANY.name },
      { label: "Sede CORE829", value: COMPANY.address },
      { label: "CUI CORE829", value: `CUI/CIF ${COMPANY.cui}` },
      { label: "Stefan Serban", value: COMPANY.rep },
    ];
  }, [draft]);

  if (error) return <p role="alert" className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-destructive">{error}</p>;
  if (draft === undefined || data === null) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Caricamento">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }
  if (draft === null) return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Documento non trovato.</p>;
  return <PdfEditorView draft={draft} pdfUrl={data.url} pages={data.pages} initial={data.annotations} quickTexts={quickTexts} onSave={onSave} onOpen={onOpen} onSend={onSend} />;
}
