"use client";

import { useMutation, useQuery } from "convex/react";
import { Pencil, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import { SITE_LOCALES, SITE_PAGES } from "@convex/lib/siteConfig";
import { Field, NativeSelect } from "@/components/admin/Field";
import { PageHeader } from "@/components/dash/DashShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";

const pageLabel = (k: string) => SITE_PAGES.find((p) => p.key === k)?.label ?? k;
const localeLabel = (l: string) => (l === "*" ? "Tutte le lingue" : l);

/**
 * SEO delle pagine di core829.net: titolo e descrizione che compaiono su Google, e se la pagina va indicizzata.
 * Si sceglie la pagina e la lingua; «Tutte le lingue» vale dove non c'è un testo per quella lingua. Vuoto = testo predefinito del sito.
 */
export function SiteSeo() {
  const rows = useQuery(api.site.seoList, {});
  const save = useMutation(api.site.seoSave);
  const [page, setPage] = useState<string>("home");
  const [locale, setLocale] = useState<string>("it");
  const current = rows?.find((r) => r.page === page && r.locale === locale);
  const [form, setForm] = useState({ title: "", description: "", noindex: false });
  const [loadedKey, setLoadedKey] = useState("");
  const key = `${page}|${locale}|${current ? "1" : "0"}`;
  if (rows !== undefined && loadedKey !== key) {
    setLoadedKey(key);
    setForm({ title: current?.title ?? "", description: current?.description ?? "", noindex: current?.noindex ?? false });
  }
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      await save({ page, locale, title: form.title, description: form.description, noindex: form.noindex });
      toast.success("SEO salvata. Il sito la mostra entro pochi minuti.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader kicker="Sito core829.net" title="SEO" description="Titolo e descrizione per Google e per le anteprime dei link, pagina per pagina e lingua per lingua. Lascia vuoto per usare il testo predefinito del sito." />
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10 shadow-(--shadow-soft)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="seo-page" label="Pagina">
            <NativeSelect id="seo-page" value={page} onChange={(e) => setPage(e.target.value)}>
              {SITE_PAGES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label} {p.path || "/"}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="seo-locale" label="Lingua">
            <NativeSelect id="seo-locale" value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="*">Tutte le lingue (se manca il testo)</option>
              {SITE_LOCALES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field id="seo-title" label="Titolo della pagina" hint={`${form.title.length}/70 caratteri consigliati`}>
          <Input id="seo-title" maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field id="seo-desc" label="Descrizione" hint={`${form.description.length}/160 caratteri consigliati`}>
          <Textarea id="seo-desc" rows={3} maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={form.noindex} onChange={(e) => setForm({ ...form, noindex: e.target.checked })} /> Nascondi questa pagina ai motori di ricerca
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Salvo…" : "Salva"}
          </Button>
          <p className="text-xs text-muted-foreground">Anteprima su Google: {form.title || "(titolo predefinito)"} — {form.description || "(descrizione predefinita)"}</p>
        </div>
      </form>

      <h2 className="font-display text-lg tracking-tight">Personalizzazioni attive</h2>
      {rows === undefined ? (
        <Skeleton className="h-24 w-full rounded-2xl" />
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Nessuna: il sito usa i suoi testi.</p>
      ) : (
        <ul className="divide-y rounded-2xl bg-card ring-1 ring-foreground/10">
          {rows.map((r) => (
            <li key={`${r.page}|${r.locale}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {pageLabel(r.page)} · {localeLabel(r.locale)}
                  {r.noindex ? " · nascosta" : ""}
                </p>
                <p className="truncate text-xs text-muted-foreground">{r.title || "(titolo predefinito)"}</p>
              </div>
              <Button size="icon" variant="ghost" aria-label={`Modifica ${pageLabel(r.page)} ${localeLabel(r.locale)}`} onClick={() => { setPage(r.page); setLocale(r.locale); }}>
                <Pencil aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Ripristina il testo predefinito di ${pageLabel(r.page)} ${localeLabel(r.locale)}`}
                onClick={() => void save({ page: r.page, locale: r.locale, title: "", description: "", noindex: false }).then(() => toast.success("Ripristinato.")).catch((e: unknown) => toast.error(errorMessage(e)))}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
