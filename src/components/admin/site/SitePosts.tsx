"use client";

import { useAction } from "convex/react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { SitePost } from "@convex/siteActions";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Field, NativeSelect, TextField } from "@/components/admin/Field";
import { BridgeError, SiteLoading, slugify } from "@/components/admin/site/SiteBits";
import { useSiteData } from "@/components/admin/site/useSiteData";
import { PageHeader } from "@/components/dash/DashShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

const MAX_COVER = 5 * 1024 * 1024;

/** Carica un'immagine nell'archivio del sito tramite un indirizzo temporaneo e restituisce l'ID del file. */
export async function uploadSiteImage(getUrl: () => Promise<string>, file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) throw new Error("Serve un'immagine PNG, JPG, WebP o GIF.");
  if (file.size > MAX_COVER) throw new Error("L'immagine supera i 5 MB.");
  const response = await fetch(await getUrl(), { method: "POST", headers: { "Content-Type": file.type }, body: file });
  if (!response.ok) throw new Error("Caricamento non riuscito.");
  const body: unknown = await response.json();
  const id = typeof body === "object" && body !== null && "storageId" in body ? (body as { storageId: unknown }).storageId : null;
  if (typeof id !== "string") throw new Error("Caricamento non riuscito.");
  return id;
}

/** Blog del sito Andromedia Web: elenco, creazione, modifica, pubblicazione, eliminazione. */
export function SitePosts() {
  const { data, error, loading, reload } = useSiteData(api.siteActions.postsList, {});
  const save = useAction(api.siteActions.postSave);
  const setStatus = useAction(api.siteActions.postSetStatus);
  const remove = useAction(api.siteActions.postRemove);
  const getUrl = useAction(api.siteActions.uploadUrl);
  const [editing, setEditing] = useState<SitePost | "new" | null>(null);
  const [toDelete, setToDelete] = useState<SitePost | null>(null);
  const [pending, setPending] = useState(false);
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  function open(p: SitePost | "new") {
    setEditing(p);
    setSlug(p === "new" ? "" : p.slug);
    setSlugTouched(p !== "new");
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const post = editing === "new" || editing === null ? null : editing;
    setPending(true);
    try {
      const cover = form.get("cover");
      const coverStorageId = cover instanceof File && cover.size > 0 ? await uploadSiteImage(() => getUrl({ kind: "posts" }), cover) : undefined;
      await save({
        id: post?._id ?? null,
        title: String(form.get("title") ?? ""),
        slug: slug || slugify(String(form.get("title") ?? "")),
        excerpt: String(form.get("excerpt") ?? ""),
        content: String(form.get("content") ?? ""),
        tags: String(form.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
        status: form.get("status") === "published" ? "published" : "draft",
        ...(coverStorageId ? { coverStorageId } : {}),
      });
      toast.success("Articolo salvato.");
      setEditing(null);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const current = editing === "new" || editing === null ? null : editing;
  return (
    <>
      <PageHeader
        kicker="Sito Andromedia Web"
        title="Blog"
        description="Gli articoli del sito. Una bozza non è visibile al pubblico finché non la pubblichi."
        actions={
          <Button onClick={() => open("new")}>
            <Plus aria-hidden /> Nuovo articolo
          </Button>
        }
      />
      {error && !data ? <BridgeError message={error} onRetry={() => void reload()} /> : null}
      {loading && !data ? <SiteLoading /> : null}
      {data ? (
        data.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Nessun articolo. Scrivi il primo con «Nuovo articolo».</p>
        ) : (
          <ul className="divide-y rounded-2xl bg-card ring-1 ring-foreground/10 shadow-(--shadow-soft)">
            {data.map((p) => (
              <li key={p._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    /blog/{p.slug} · aggiornato il {formatDate(p.updatedAt)}
                    {p.tags && p.tags.length > 0 ? ` · ${p.tags.join(", ")}` : ""}
                  </p>
                </div>
                <Badge variant={p.status === "published" ? "default" : "secondary"}>{p.status === "published" ? "Pubblicato" : "Bozza"}</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void setStatus({ id: p._id, status: p.status === "published" ? "draft" : "published" })
                      .then(() => toast.success(p.status === "published" ? "Rimesso in bozza." : "Pubblicato."))
                      .then(reload)
                      .catch((err: unknown) => toast.error(errorMessage(err)));
                  }}
                >
                  {p.status === "published" ? "Metti in bozza" : "Pubblica"}
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Modifica «${p.title}»`} onClick={() => open(p)}>
                  <Pencil aria-hidden />
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Elimina «${p.title}»`} onClick={() => setToDelete(p)}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {editing !== null ? (
        <Dialog open onOpenChange={(o) => !o && !pending && setEditing(null)}>
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{current ? "Modifica articolo" : "Nuovo articolo"}</DialogTitle>
              <DialogDescription>Il testo è semplice (niente HTML). Titolo, indirizzo e riassunto servono anche ai motori di ricerca.</DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="grid gap-4" noValidate>
              <TextField
                id="title"
                label="Titolo"
                required
                maxLength={140}
                defaultValue={current?.title ?? ""}
                onChange={(e) => {
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
              />
              <Field id="slug" label="Indirizzo (slug)" hint={`Pagina: /blog/${slug || "…"}`}>
                <input
                  id="slug"
                  value={slug}
                  maxLength={120}
                  onChange={(e) => {
                    setSlug(slugify(e.target.value));
                    setSlugTouched(true);
                  }}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </Field>
              <Field id="excerpt" label="Riassunto" hint="Massimo 300 caratteri.">
                <Textarea id="excerpt" name="excerpt" rows={2} maxLength={300} defaultValue={current?.excerpt ?? ""} />
              </Field>
              <Field id="content" label="Testo">
                <Textarea id="content" name="content" rows={12} maxLength={40000} defaultValue={current?.content ?? ""} />
              </Field>
              <TextField id="tags" label="Etichette" hint="Separate da virgola, fino a 10." defaultValue={(current?.tags ?? []).join(", ")} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="status" label="Stato">
                  <NativeSelect id="status" name="status" defaultValue={current?.status ?? "draft"}>
                    <option value="draft">Bozza</option>
                    <option value="published">Pubblicato</option>
                  </NativeSelect>
                </Field>
                <Field id="cover" label="Immagine di copertina" hint={current?.coverUrl ? "Lascia vuoto per tenere quella attuale." : "PNG, JPG, WebP, massimo 5 MB."}>
                  <input id="cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm" />
                </Field>
              </div>
              {current?.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- copertina servita dall'archivio del sito
                <img src={current.coverUrl} alt="Copertina attuale" className="h-24 w-auto rounded-lg object-cover ring-1 ring-foreground/10" />
              ) : null}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
                  Annulla
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Salvo…" : "Salva"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminare l'articolo?"
        description={`«${toDelete?.title ?? ""}» verrà cancellato dal sito per sempre. Se vuoi solo nasconderlo, mettilo in bozza.`}
        confirmLabel="Elimina"
        destructive
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const p = toDelete;
          setToDelete(null);
          if (p) void remove({ id: p._id }).then(() => toast.success("Articolo eliminato.")).then(reload).catch((err: unknown) => toast.error(errorMessage(err)));
        }}
      />
    </>
  );
}
