"use client";

import { useAction } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { Field } from "@/components/admin/Field";
import { SettingCard } from "@/components/admin/site/SiteContent";
import { BridgeError, SiteLoading } from "@/components/admin/site/SiteBits";
import { useSiteData } from "@/components/admin/site/useSiteData";
import { PageHeader } from "@/components/dash/DashShell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");

const ROUTES = [
  { key: "home", label: "Home", path: "/" },
  { key: "servizi", label: "Servizi", path: "/servizi" },
  { key: "portfolio", label: "Lavori", path: "/portfolio" },
  { key: "contatti", label: "Contatti", path: "/contatti" },
  { key: "blog", label: "Blog", path: "/blog" },
] as const;

type Save = (a: { key: string; value: Obj }) => Promise<unknown>;

function RouteCard({ route, initial, save, reload }: { route: (typeof ROUTES)[number]; initial: Obj; save: Save; reload: () => Promise<void> }) {
  const [v, setV] = useState({ title: str(initial.title), description: str(initial.description), keywords: str(initial.keywords), noindex: initial.noindex === true });
  const [savedKey, setSavedKey] = useState(JSON.stringify(v));
  const dirty = JSON.stringify(v) !== savedKey;
  const id = `seo-${route.key}`;
  return (
    <SettingCard
      title={`${route.label} (${route.path})`}
      description="Titolo e descrizione che compaiono su Google e nelle anteprime dei link."
      dirty={dirty}
      onSave={async () => {
        await save({ key: `seo:${route.key}`, value: v });
        setSavedKey(JSON.stringify(v));
        await reload();
      }}
    >
      <Field id={`${id}-t`} label="Titolo della pagina" hint={`${v.title.length}/70 caratteri consigliati`}>
        <Input id={`${id}-t`} maxLength={120} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="es. Servizi — Andromedia Web" />
      </Field>
      <Field id={`${id}-d`} label="Descrizione" hint={`${v.description.length}/160 caratteri consigliati`}>
        <Textarea id={`${id}-d`} rows={3} maxLength={300} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
      <Field id={`${id}-k`} label="Parole chiave" hint="Separate da virgola.">
        <Input id={`${id}-k`} maxLength={300} value={v.keywords} onChange={(e) => setV({ ...v, keywords: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={v.noindex} onChange={(e) => setV({ ...v, noindex: e.target.checked })} /> Nascondi questa pagina ai motori di ricerca
      </label>
    </SettingCard>
  );
}

/** SEO del sito Andromedia Web: titoli, descrizioni e indicizzazione per pagina. */
export function SiteSeo() {
  const { data, error, loading, reload } = useSiteData(api.siteActions.settingsAll, {});
  const save = useAction(api.siteActions.settingSet) as unknown as Save;
  const refresh = async () => void (await reload());
  const def = obj(data?.["seo:default"]);
  const [siteName, setSiteName] = useState<string | null>(null);
  const [noindex, setNoindex] = useState<boolean | null>(null);
  const nameValue = siteName ?? str(def.siteName);
  const noindexValue = noindex ?? def.noindex === true;
  const dirtyDefault = (siteName !== null && siteName !== str(def.siteName)) || (noindex !== null && noindex !== (def.noindex === true));

  return (
    <>
      <PageHeader kicker="Sito Andromedia Web" title="SEO" description="Come il sito appare su Google e quando condividi un link. Ogni pagina ha la sua scheda." />
      {error && !data ? <BridgeError message={error} onRetry={() => void reload()} /> : null}
      {loading && !data ? <SiteLoading /> : null}
      {data ? (
        <div className="space-y-4">
          <SettingCard
            title="Impostazioni comuni"
            description="Valgono per tutto il sito."
            dirty={dirtyDefault}
            onSave={async () => {
              await save({ key: "seo:default", value: { siteName: nameValue, noindex: noindexValue } });
              setSiteName(null);
              setNoindex(null);
              await refresh();
            }}
          >
            <Field id="seo-site" label="Nome del sito">
              <Input id="seo-site" maxLength={80} value={nameValue} onChange={(e) => setSiteName(e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={noindexValue} onChange={(e) => setNoindex(e.target.checked)} /> Nascondi tutto il sito ai motori di ricerca (da usare solo in prova)
            </label>
          </SettingCard>
          {ROUTES.map((r) => (
            <RouteCard key={r.key} route={r} initial={obj(data[`seo:${r.key}`])} save={save} reload={refresh} />
          ))}
        </div>
      ) : null}
    </>
  );
}
