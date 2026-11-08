"use client";

import { useAction } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "@convex/_generated/api";
import { Field } from "@/components/admin/Field";
import { BridgeError, SiteLoading } from "@/components/admin/site/SiteBits";
import { useSiteData } from "@/components/admin/site/useSiteData";
import { PageHeader } from "@/components/dash/DashShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Scheda con un titolo, il proprio pulsante «Salva» e lo stato delle modifiche. */
export function SettingCard({ title, description, children, onSave, dirty }: { title: string; description?: string; children: ReactNode; onSave: () => Promise<void>; dirty: boolean }) {
  const [pending, setPending] = useState(false);
  return (
    <section aria-label={title} className="space-y-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10 shadow-(--shadow-soft)">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base tracking-tight">{title}</h2>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        <Button
          size="sm"
          disabled={pending || !dirty}
          onClick={() => {
            setPending(true);
            onSave()
              .then(() => toast.success(`${title}: salvato. Il sito si aggiorna entro pochi istanti.`))
              .catch((e: unknown) => toast.error(errorMessage(e)))
              .finally(() => setPending(false));
          }}
        >
          {pending ? "Salvo…" : dirty ? "Salva" : "Salvato"}
        </Button>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function TextRow({ id, label, value, onChange, area = false, max = 200 }: { id: string; label: string; value: string; onChange: (v: string) => void; area?: boolean; max?: number }) {
  return (
    <Field id={id} label={label}>
      {area ? <Textarea id={id} rows={3} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} /> : <Input id={id} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

/** Editor di un valore (oggetto) con salvataggio: tiene la copia di lavoro e sa se e' cambiata. */
function useDraft(initial: Obj, key: string, save: (args: { key: string; value: Obj }) => Promise<unknown>, reload: () => Promise<void>) {
  const [value, setValue] = useState<Obj>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const dirty = JSON.stringify(value) !== saved;
  const set = (path: string[], v: unknown) =>
    setValue((cur) => {
      const next: Obj = structuredClone(cur);
      let node = next;
      for (const p of path.slice(0, -1)) node = (node[p] = obj(node[p])) as Obj;
      node[path[path.length - 1]] = v;
      return next;
    });
  const commit = async () => {
    await save({ key, value });
    setSaved(JSON.stringify(value));
    await reload();
  };
  return { value, set, dirty, commit };
}

function GlobalCard({ initial, save, reload }: { initial: Obj; save: (a: { key: string; value: Obj }) => Promise<unknown>; reload: () => Promise<void> }) {
  const d = useDraft(initial, "global", save, reload);
  const contact = obj(d.value.contact);
  const toggles = obj(d.value.toggles);
  const socials = (Array.isArray(d.value.socials) ? d.value.socials : []).map(obj);
  return (
    <SettingCard title="Dati generali" description="Nome, contatti e collegamenti social mostrati in testata e piè di pagina." onSave={d.commit} dirty={d.dirty}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextRow id="g-name" label="Nome" value={str(d.value.name)} onChange={(v) => d.set(["name"], v)} max={80} />
        <TextRow id="g-tagline" label="Slogan" value={str(d.value.tagline)} onChange={(v) => d.set(["tagline"], v)} max={120} />
        <TextRow id="g-email" label="Email" value={str(contact.email)} onChange={(v) => d.set(["contact", "email"], v)} />
        <TextRow id="g-phone" label="Telefono" value={str(contact.phone)} onChange={(v) => d.set(["contact", "phone"], v)} max={40} />
      </div>
      <TextRow id="g-address" label="Indirizzo" value={str(contact.address)} onChange={(v) => d.set(["contact", "address"], v)} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Social</legend>
        {socials.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input aria-label={`Nome del social ${i + 1}`} className="w-36" placeholder="Nome" maxLength={40} value={str(s.name)} onChange={(e) => d.set(["socials"], socials.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <Input aria-label={`Indirizzo del social ${i + 1}`} className="min-w-0 flex-1" placeholder="https://…" maxLength={300} value={str(s.href)} onChange={(e) => d.set(["socials"], socials.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} />
            <Input aria-label={`Icona del social ${i + 1}`} className="w-28" placeholder="icona" maxLength={30} value={str(s.icon)} onChange={(e) => d.set(["socials"], socials.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)))} />
            <Button type="button" size="icon" variant="ghost" aria-label={`Togli il social ${i + 1}`} onClick={() => d.set(["socials"], socials.filter((_, j) => j !== i))}>
              <Trash2 aria-hidden />
            </Button>
          </div>
        ))}
        {socials.length < 12 ? (
          <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => d.set(["socials"], [...socials, { name: "", href: "", icon: "link" }])}>
            <Plus aria-hidden /> Aggiungi social
          </Button>
        ) : null}
      </fieldset>
      <fieldset className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <legend className="mb-1 text-sm font-medium">Elementi della pagina</legend>
        {([["marquee", "Fascia scorrevole"], ["heroBadges", "Badge nella prima schermata"], ["spaceCta", "Invito finale all'azione"]] as const).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2">
            <input type="checkbox" className="size-4" checked={toggles[k] !== false} onChange={(e) => d.set(["toggles", k], e.target.checked)} /> {label}
          </label>
        ))}
      </fieldset>
    </SettingCard>
  );
}

const SECTIONS: [string, string][] = [["servizi", "Servizi"], ["lavori", "Lavori"], ["processo", "Processo"], ["visione", "Visione"], ["faq", "Domande frequenti"]];

function HomeCard({ initial, save, reload }: { initial: Obj; save: (a: { key: string; value: Obj }) => Promise<unknown>; reload: () => Promise<void> }) {
  const d = useDraft(initial, "content:home", save, reload);
  const hero = obj(d.value.hero);
  const p = obj(hero.ctaPrimary);
  const s = obj(hero.ctaSecondary);
  const cta = obj(d.value.spaceCta);
  return (
    <SettingCard title="Pagina iniziale" description="Testi della prima schermata, delle sezioni e dell'invito finale. Lascia vuoto un campo per usare il testo predefinito." onSave={d.commit} dirty={d.dirty}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextRow id="h-micro" label="Etichetta in alto" value={str(hero.microLabel)} onChange={(v) => d.set(["hero", "microLabel"], v)} max={80} />
        <span />
        <TextRow id="h-a" label="Titolo, prima parte" value={str(hero.titleA)} onChange={(v) => d.set(["hero", "titleA"], v)} max={80} />
        <TextRow id="h-b" label="Titolo, seconda parte" value={str(hero.titleB)} onChange={(v) => d.set(["hero", "titleB"], v)} max={80} />
      </div>
      <TextRow id="h-sub" label="Sottotitolo" area value={str(hero.subtitle)} onChange={(v) => d.set(["hero", "subtitle"], v)} max={300} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextRow id="h-p-l" label="Pulsante principale: testo" value={str(p.label)} onChange={(v) => d.set(["hero", "ctaPrimary", "label"], v)} max={60} />
        <TextRow id="h-p-h" label="Pulsante principale: pagina" value={str(p.href)} onChange={(v) => d.set(["hero", "ctaPrimary", "href"], v)} max={120} />
        <TextRow id="h-s-l" label="Pulsante secondario: testo" value={str(s.label)} onChange={(v) => d.set(["hero", "ctaSecondary", "label"], v)} max={60} />
        <TextRow id="h-s-h" label="Pulsante secondario: pagina" value={str(s.href)} onChange={(v) => d.set(["hero", "ctaSecondary", "href"], v)} max={120} />
      </div>
      {SECTIONS.map(([k, name]) => (
        <div key={k} className="grid gap-4 sm:grid-cols-2">
          <TextRow id={`h-${k}-l`} label={`${name}: etichetta`} value={str(obj(d.value[k]).label)} onChange={(v) => d.set([k, "label"], v)} max={100} />
          <TextRow id={`h-${k}-t`} label={`${name}: titolo`} value={str(obj(d.value[k]).title)} onChange={(v) => d.set([k, "title"], v)} max={140} />
        </div>
      ))}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextRow id="c-t" label="Invito finale: titolo" value={str(cta.title)} onChange={(v) => d.set(["spaceCta", "title"], v)} max={100} />
        <TextRow id="c-s" label="Invito finale: testo" value={str(cta.subtitle)} onChange={(v) => d.set(["spaceCta", "subtitle"], v)} max={200} />
        <TextRow id="c-b" label="Invito finale: pulsante" value={str(cta.button)} onChange={(v) => d.set(["spaceCta", "button"], v)} max={50} />
      </div>
    </SettingCard>
  );
}

function FaqCard({ initial, save, reload }: { initial: Obj; save: (a: { key: string; value: Obj }) => Promise<unknown>; reload: () => Promise<void> }) {
  const d = useDraft(initial, "content:faq", save, reload);
  const items = (Array.isArray(d.value.items) ? d.value.items : []).map(obj);
  return (
    <SettingCard title="Domande frequenti" description="Se la lista è vuota il sito usa le domande predefinite." onSave={d.commit} dirty={d.dirty}>
      {items.map((it, i) => (
        <div key={i} className="grid gap-2 rounded-xl p-3 ring-1 ring-foreground/10">
          <Input aria-label={`Domanda ${i + 1}`} placeholder="Domanda" maxLength={200} value={str(it.q)} onChange={(e) => d.set(["items"], items.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} />
          <Textarea aria-label={`Risposta ${i + 1}`} placeholder="Risposta" rows={3} maxLength={1200} value={str(it.a)} onChange={(e) => d.set(["items"], items.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
          <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={() => d.set(["items"], items.filter((_, j) => j !== i))}>
            <Trash2 aria-hidden /> Togli
          </Button>
        </div>
      ))}
      {items.length < 40 ? (
        <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => d.set(["items"], [...items, { q: "", a: "" }])}>
          <Plus aria-hidden /> Aggiungi domanda
        </Button>
      ) : null}
    </SettingCard>
  );
}

/** Contenuti del sito Andromedia Web: dati generali, pagina iniziale e domande frequenti. */
export function SiteContent() {
  const { data, error, loading, reload } = useSiteData(api.siteActions.settingsAll, {});
  const save = useAction(api.siteActions.settingSet) as unknown as (a: { key: string; value: Obj }) => Promise<unknown>;
  const refresh = async () => void (await reload());
  return (
    <>
      <PageHeader kicker="Sito Andromedia Web" title="Contenuti" description="Testi e dati del sito. Ogni scheda si salva da sola; il testo viene ripulito da tag e caratteri non ammessi." />
      {error && !data ? <BridgeError message={error} onRetry={() => void reload()} /> : null}
      {loading && !data ? <SiteLoading /> : null}
      {data ? (
        <div className="space-y-4">
          <GlobalCard initial={obj(data.global)} save={save} reload={refresh} />
          <HomeCard initial={obj(data["content:home"])} save={save} reload={refresh} />
          <FaqCard initial={obj(data["content:faq"])} save={save} reload={refresh} />
        </div>
      ) : null}
    </>
  );
}
