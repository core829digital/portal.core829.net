"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { CORE_WIDGET_TYPES, FREE_WIDGET_TYPES, MAX_WIDGETS, WIDGET_LABEL, type Widget, type WidgetType } from "@convex/lib/widgets";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Field, NativeSelect, TextField } from "@/components/admin/Field";
import { PortalPreview } from "@/components/portal/PortalPages";
import { ErrorBoundary } from "@/components/portal/ErrorBoundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";

type FreeWidget = Extract<Widget, { type: "notice" | "links" | "contact" }>;

function isFree(w: Widget): w is FreeWidget {
  return w.type === "notice" || w.type === "links" || w.type === "contact";
}

function newId(type: WidgetType): string {
  return `${type}-${crypto.randomUUID().slice(0, 8)}`;
}

function linksToText(items: { label: string; url: string }[]): string {
  return items.map((i) => `${i.label} | ${i.url}`).join("\n");
}

/** "Nome | https://..." una riga per link. Restituisce un errore leggibile se una riga non va. */
function parseLinks(text: string): { items: { label: string; url: string }[] } | { error: string } {
  const items: { label: string; url: string }[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;
    const cut = line.indexOf("|");
    if (cut < 1) return { error: `Riga ${i + 1}: scrivi «Nome | https://indirizzo».` };
    items.push({ label: line.slice(0, cut).trim(), url: line.slice(cut + 1).trim() });
  }
  if (items.length === 0) return { error: "Aggiungi almeno un link." };
  return { items };
}

function FreeWidgetDialog({ widget, onSave, onClose }: { widget: FreeWidget; onSave: (w: FreeWidget) => void; onClose: () => void }) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "");
    if (widget.type === "links") {
      const parsed = parseLinks(String(form.get("items") ?? ""));
      if ("error" in parsed) return void toast.error(parsed.error);
      onSave({ ...widget, title, items: parsed.items });
    } else {
      onSave({ ...widget, title, body: String(form.get("body") ?? "") });
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{WIDGET_LABEL[widget.type]}</DialogTitle>
          <DialogDescription>Solo testo semplice. Il cliente lo vedrà esattamente come lo scrivi.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <TextField id="title" label="Titolo" defaultValue={widget.title} required maxLength={80} autoFocus />
          {widget.type === "links" ? (
            <Field id="items" label="Link" hint="Una riga per link, nel formato: Nome | https://indirizzo (massimo 10, solo https).">
              <Textarea id="items" name="items" defaultValue={linksToText(widget.items)} rows={5} required />
            </Field>
          ) : (
            <Field id="body" label="Testo">
              <Textarea id="body" name="body" defaultValue={widget.body} rows={5} maxLength={widget.type === "notice" ? 2000 : 1000} required />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit">Applica</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DocumentsPreviewPlaceholder() {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">Contratti e documenti</h2>
      <p className="rounded-lg border p-5 text-sm text-muted-foreground">
        Nell&apos;anteprima i documenti restano bloccati: il cliente li vede solo dopo aver inserito il codice ricevuto via email.
      </p>
    </section>
  );
}

function Preview({ clientId, widgets }: { clientId: Id<"clients">; widgets: Widget[] }) {
  const data = useQuery(api.pages.preview, { clientId, widgets });
  if (data === undefined) return <Skeleton className="h-40 w-full" />;
  if (data === null) return <p className="text-sm text-muted-foreground">Cliente non trovato.</p>;
  return <PortalPreview data={data} documents={<DocumentsPreviewPlaceholder />} />;
}

export function PageBuilder({ clientId }: { clientId: Id<"clients"> }) {
  const server = useQuery(api.pages.get, { clientId });
  const save = useMutation(api.pages.save);
  const reset = useMutation(api.pages.reset);
  const [draft, setDraft] = useState<Widget[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, setPending] = useState(false);
  const [addType, setAddType] = useState<WidgetType | "">("");

  if (server === undefined) return <Skeleton className="h-48 w-full" />;
  const widgets: Widget[] = draft ?? (server.widgets as Widget[]);
  const present = new Set(widgets.map((w) => w.type));
  const addable: WidgetType[] = [...CORE_WIDGET_TYPES.filter((t) => !present.has(t)), ...FREE_WIDGET_TYPES];

  const update = (next: Widget[]) => setDraft(next);
  const move = (index: number, delta: -1 | 1) => {
    const next = [...widgets];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  };
  const toggle = (index: number) => update(widgets.map((w, i) => (i === index ? { ...w, enabled: !w.enabled } : w)));
  const remove = (index: number) => update(widgets.filter((_, i) => i !== index));

  function add() {
    if (addType === "") return;
    if (widgets.length >= MAX_WIDGETS) return void toast.error(`Massimo ${MAX_WIDGETS} blocchi.`);
    let widget: Widget;
    if (addType === "notice") widget = { id: newId(addType), type: "notice", enabled: true, title: "Avviso", body: "Scrivi qui il tuo messaggio." };
    else if (addType === "contact") widget = { id: newId(addType), type: "contact", enabled: true, title: "Contatti", body: "Scrivici rispondendo al messaggio con cui hai ricevuto questo link." };
    else if (addType === "links") widget = { id: newId(addType), type: "links", enabled: true, title: "Link utili", items: [{ label: "Il nostro sito", url: "https://www.core829.net" }] };
    else widget = { id: addType, type: addType, enabled: true };
    update([...widgets, widget]);
    setAddType("");
    if (isFree(widget)) setEditing(widget.id);
  }

  async function onSave() {
    setPending(true);
    try {
      await save({ clientId, widgets });
      toast.success("Pagina salvata: il cliente la vede subito.");
      setDraft(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  const editingWidget = editing ? widgets.find((w) => w.id === editing) : undefined;

  return (
    <section aria-labelledby="page-title" className="space-y-6">
      <div>
        <h2 id="page-title" className="text-lg font-semibold">
          Pagina del cliente
        </h2>
        <p className="text-sm text-muted-foreground">
          Scegli quali blocchi vede questo cliente e in che ordine. {server.isCustom ? "Pagina personalizzata." : "Ora vale la pagina predefinita."}
        </p>
      </div>

      <ol className="divide-y rounded-lg border">
        {widgets.map((w, i) => (
          <li key={w.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="flex flex-col">
              <Button variant="ghost" size="icon-xs" aria-label={`Sposta su: ${WIDGET_LABEL[w.type]}`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp aria-hidden />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label={`Sposta giù: ${WIDGET_LABEL[w.type]}`} disabled={i === widgets.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown aria-hidden />
              </Button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{isFree(w) ? w.title : WIDGET_LABEL[w.type]}</p>
              <p className="text-xs text-muted-foreground">{isFree(w) ? WIDGET_LABEL[w.type] : "Mostra i dati reali del cliente"}</p>
            </div>
            {!w.enabled ? <Badge variant="outline">Nascosto</Badge> : null}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={w.enabled} onChange={() => toggle(i)} />
              Visibile
            </label>
            {isFree(w) ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(w.id)}>
                <Pencil aria-hidden /> Modifica
              </Button>
            ) : null}
            <Button variant="ghost" size="icon" aria-label={`Rimuovi: ${WIDGET_LABEL[w.type]}`} onClick={() => remove(i)}>
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
        {widgets.length === 0 ? <li className="p-6 text-center text-sm text-muted-foreground">La pagina è vuota: aggiungi almeno un blocco.</li> : null}
      </ol>

      <div className="flex flex-wrap items-end gap-3">
        <Field id="addType" label="Aggiungi un blocco">
          <NativeSelect id="addType" value={addType} onChange={(e) => setAddType(e.target.value as WidgetType | "")} className="min-w-52">
            <option value="">Scegli…</option>
            {addable.map((t) => (
              <option key={t} value={t}>
                {WIDGET_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Button variant="outline" onClick={add} disabled={addType === ""}>
          <Plus aria-hidden /> Aggiungi
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          {server.isCustom ? (
            <Button variant="outline" onClick={() => setConfirmReset(true)}>
              Ripristina predefinita
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setDraft(null)} disabled={draft === null}>
            Annulla modifiche
          </Button>
          <Button onClick={() => void onSave()} disabled={draft === null || pending}>
            {pending ? "Salvataggio…" : "Salva pagina"}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Anteprima: così la vede il cliente {draft ? "(con le modifiche non salvate)" : ""}
        </h3>
        <div className="max-h-[70vh] space-y-10 overflow-y-auto rounded-lg border bg-background p-4 sm:p-6">
          {/* Se il contenuto in modifica non e' valido l'anteprima lo segnala invece di rompersi. */}
          <ErrorBoundary
            key={JSON.stringify(widgets)}
            fallback={(error) => <p className="text-sm text-destructive">Anteprima non disponibile: {errorMessage(error, "controlla i contenuti dei blocchi.")}</p>}
          >
            <Preview clientId={clientId} widgets={widgets} />
          </ErrorBoundary>
        </div>
      </div>

      {editingWidget && isFree(editingWidget) ? (
        <FreeWidgetDialog
          key={editingWidget.id}
          widget={editingWidget}
          onClose={() => setEditing(null)}
          onSave={(updated) => {
            update(widgets.map((w) => (w.id === updated.id ? updated : w)));
            setEditing(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmReset}
        title="Ripristinare la pagina predefinita?"
        description="Le personalizzazioni di questo cliente (blocchi aggiunti, ordine, visibilità) andranno perse."
        confirmLabel="Ripristina"
        destructive
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          void reset({ clientId })
            .then(() => {
              setDraft(null);
              toast.success("Pagina ripristinata.");
            })
            .catch((e: unknown) => toast.error(errorMessage(e)));
        }}
      />
    </section>
  );
}
