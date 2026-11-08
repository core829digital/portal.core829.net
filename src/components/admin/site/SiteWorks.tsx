"use client";

import { useAction } from "convex/react";
import { ExternalLink, Plus, Star, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { SiteWork } from "@convex/siteActions";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Field, NativeSelect, TextField } from "@/components/admin/Field";
import { BridgeError, SiteLoading } from "@/components/admin/site/SiteBits";
import { uploadSiteImage } from "@/components/admin/site/SitePosts";
import { useSiteData } from "@/components/admin/site/useSiteData";
import { PageHeader } from "@/components/dash/DashShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";

const CATEGORIES = ["Sito Web", "E-Commerce", "Brand Identity", "Social Media", "Advertising", "SEO", "Intelligenza Artificiale"];

/** Portfolio del sito: i lavori mostrati nella pagina «Lavori». */
export function SiteWorks() {
  const { data, error, loading, reload } = useSiteData(api.siteActions.worksList, {});
  const create = useAction(api.siteActions.workCreate);
  const remove = useAction(api.siteActions.workRemove);
  const getUrl = useAction(api.siteActions.uploadUrl);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(false);
  const [toDelete, setToDelete] = useState<SiteWork | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    try {
      const image = form.get("image");
      const imageStorageId = image instanceof File && image.size > 0 ? await uploadSiteImage(() => getUrl({ kind: "portfolio" }), image) : undefined;
      await create({
        title: String(form.get("title") ?? ""),
        client: String(form.get("client") ?? ""),
        url: String(form.get("url") ?? "").trim(),
        category: String(form.get("category") ?? "Sito Web"),
        description: String(form.get("description") ?? ""),
        featured: form.get("featured") === "on",
        ...(imageStorageId ? { imageStorageId } : {}),
      });
      toast.success("Lavoro aggiunto al sito.");
      setAdding(false);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader
        kicker="Sito Andromedia Web"
        title="Portfolio"
        description="I lavori mostrati sul sito. Quelli «in evidenza» compaiono per primi."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden /> Nuovo lavoro
          </Button>
        }
      />
      {error && !data ? <BridgeError message={error} onRetry={() => void reload()} /> : null}
      {loading && !data ? <SiteLoading /> : null}
      {data ? (
        data.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Il sito usa il portfolio di esempio. Aggiungi il primo lavoro vero con «Nuovo lavoro».</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((w) => (
              <li key={w._id} className="flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 shadow-(--shadow-soft)">
                {w.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- immagine servita dall'archivio del sito
                  <img src={w.imageUrl} alt={w.title} className="h-36 w-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid h-36 place-items-center bg-muted text-xs text-muted-foreground">Nessuna immagine</div>
                )}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{w.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{w.client}</p>
                    </div>
                    {w.featured ? <Star aria-label="In evidenza" className="size-4 shrink-0 fill-primary text-primary" /> : null}
                  </div>
                  <Badge variant="secondary" className="w-fit">
                    {w.category}
                  </Badge>
                  {w.description ? <p className="line-clamp-2 text-xs text-muted-foreground">{w.description}</p> : null}
                  <div className="mt-auto flex items-center gap-1 pt-1">
                    {w.url ? (
                      <a href={w.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline underline-offset-4">
                        <ExternalLink aria-hidden className="size-3" /> Apri il sito
                      </a>
                    ) : null}
                    <Button className="ml-auto" size="icon" variant="ghost" aria-label={`Elimina «${w.title}»`} onClick={() => setToDelete(w)}>
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {adding ? (
        <Dialog open onOpenChange={(o) => !o && !pending && setAdding(false)}>
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nuovo lavoro</DialogTitle>
              <DialogDescription>Compare subito nella pagina Lavori del sito.</DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="grid gap-4" noValidate>
              <TextField id="title" label="Titolo" required maxLength={120} />
              <TextField id="client" label="Cliente" required maxLength={120} />
              <TextField id="url" label="Indirizzo del progetto" placeholder="https://…" maxLength={400} hint="Facoltativo. Deve iniziare con https://" />
              <Field id="category" label="Categoria">
                <NativeSelect id="category" name="category" defaultValue="Sito Web">
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="description" label="Descrizione">
                <Textarea id="description" name="description" rows={3} maxLength={800} />
              </Field>
              <Field id="image" label="Immagine" hint="PNG, JPG o WebP, massimo 5 MB.">
                <input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm" />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="featured" className="size-4" /> In evidenza
              </label>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setAdding(false)} disabled={pending}>
                  Annulla
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Salvo…" : "Aggiungi"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminare il lavoro?"
        description={`«${toDelete?.title ?? ""}» sparirà dal sito per sempre.`}
        confirmLabel="Elimina"
        destructive
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const w = toDelete;
          setToDelete(null);
          if (w) void remove({ id: w._id }).then(() => toast.success("Lavoro eliminato.")).then(reload).catch((err: unknown) => toast.error(errorMessage(err)));
        }}
      />
    </>
  );
}
