"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { formatMetricValue, metricDelta, METRIC_CATALOG, matchSheetRows, monthLabel, UNIT_LABEL, UNITS, type MetricUnit } from "@convex/lib/reports";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { NativeSelect } from "@/components/admin/Field";
import { SHEET_EXTENSION } from "@/components/admin/docs/SpreadsheetDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { formatCents, formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { uploadToStorage } from "@/lib/upload";

type Custom = { key: string; label: string; unit: MetricUnit };

const monthInput = (ms: number) => `${new Date(ms).getUTCFullYear()}-${String(new Date(ms).getUTCMonth() + 1).padStart(2, "0")}`;
const parseMonthInput = (v: string): number | null => {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, 1) : null;
};
const toNumber = (s: string): number | null => {
  const t = s.trim().replace(/\s/g, "");
  if (t === "") return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
};

/** Elenco dei report mensili di un cliente + editor. */
export function ReportsPanel({ clientId }: { clientId: Id<"clients"> }) {
  const list = useQuery(api.reports.list, { clientId });
  const [month, setMonth] = useState<number | null>(null);
  const [now] = useState(() => Date.now());
  const currentMonth = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
  const [pick, setPick] = useState(() => monthInput(currentMonth));

  if (month !== null) return <ReportEditor key={month} clientId={clientId} month={month} onBack={() => setMonth(null)} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg tracking-tight">Report mensili</h2>
          <p className="text-sm text-muted-foreground">Le metriche e il commento del mese. Il cliente li vede (e li scarica in PDF) solo dopo la pubblicazione.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="new-report-month">
            Mese del nuovo report
          </label>
          <Input id="new-report-month" type="month" value={pick} className="w-40" onChange={(e) => setPick(e.target.value)} />
          <Button
            onClick={() => {
              const m = parseMonthInput(pick);
              if (m === null) return void toast.error("Scegli il mese.");
              setMonth(m);
            }}
          >
            <Plus aria-hidden /> Apri / crea
          </Button>
        </div>
      </div>
      {list === undefined ? (
        <Skeleton className="h-24 w-full rounded-2xl" />
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nessun report ancora. Scegli il mese e premi «Apri / crea».</p>
      ) : (
        <ul className="divide-y rounded-2xl ring-1 ring-foreground/10">
          {list.map((r) => (
            <li key={r.month}>
              <button type="button" onClick={() => setMonth(r.month)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-muted">
                <span className="font-medium capitalize">{monthLabel(r.month)}</span>
                <Badge variant={r.status === "published" ? "default" : "secondary"}>{r.status === "published" ? "Pubblicato" : "Bozza"}</Badge>
                <span className="text-sm text-muted-foreground">
                  {r.metricCount} metriche{r.hasSummary ? " · con commento" : ""}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">modificato il {formatDateTime(r.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportEditor({ clientId, month, onBack }: { clientId: Id<"clients">; month: number; onBack: () => void }) {
  const report = useQuery(api.reports.get, { clientId, month });
  const prevMonth = Date.UTC(new Date(month).getUTCFullYear(), new Date(month).getUTCMonth() - 1, 1);
  const prev = useQuery(api.reports.get, { clientId, month: prevMonth });
  if (report === undefined || prev === undefined) return <Skeleton className="h-64 w-full rounded-2xl" />;
  return <ReportForm clientId={clientId} month={month} initial={report} previous={prev} onBack={onBack} />;
}

type Loaded = NonNullable<ReturnType<typeof useQuery<typeof api.reports.get>>>;

function ReportForm({ clientId, month, initial, previous, onBack }: { clientId: Id<"clients">; month: number; initial: Loaded | null; previous: Loaded | null; onBack: () => void }) {
  const save = useMutation(api.reports.save);
  const setPublished = useMutation(api.reports.setPublished);
  const remove = useMutation(api.reports.remove);
  const uploadUrl = useMutation(api.docStudio.uploadUrl);
  const readSheet = useAction(api.docStudioActions.readSpreadsheet);

  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [nextSteps, setNextSteps] = useState(initial?.nextSteps ?? "");
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries((initial?.metrics ?? []).map((m) => [m.key, String(m.value).replace(".", ",")])));
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries((initial?.metrics ?? []).filter((m) => m.note).map((m) => [m.key, m.note as string])));
  const [custom, setCustom] = useState<Custom[]>(() => (initial?.metrics ?? []).filter((m) => m.key.startsWith("custom.")).map((m) => ({ key: m.key, label: m.label, unit: m.unit })));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "publish" | "import" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPublishedDelete, setConfirmPublishedDelete] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUnit, setNewUnit] = useState<MetricUnit>("count");

  const prevValue = useMemo(() => new Map((previous?.metrics ?? []).map((m) => [m.key, m.value])), [previous]);
  const published = initial?.status === "published";
  const filled = Object.entries(values).filter(([, v]) => toNumber(v) !== null).length;

  const touch = () => setDirty(true);
  const setValue = (key: string, v: string) => {
    setValues((s) => ({ ...s, [key]: v }));
    touch();
  };

  async function doSave(): Promise<boolean> {
    const metrics = Object.entries(values)
      .map(([key, v]) => ({ key, value: toNumber(v), c: custom.find((c) => c.key === key) }))
      .filter((m): m is { key: string; value: number; c: Custom | undefined } => m.value !== null)
      .map((m) => ({ key: m.key, value: m.value, ...(m.c ? { label: m.c.label, unit: m.c.unit } : {}), ...(notes[m.key]?.trim() ? { note: notes[m.key] } : {}) }));
    setBusy("save");
    try {
      await save({ clientId, month, summary: summary.trim() === "" ? null : summary, nextSteps: nextSteps.trim() === "" ? null : nextSteps, metrics });
      setDirty(false);
      toast.success("Report salvato.");
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "Salvataggio non riuscito."));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function togglePublish() {
    if (dirty && !(await doSave())) return;
    setBusy("publish");
    try {
      await setPublished({ clientId, month, published: !published });
      toast.success(published ? "Report ritirato: il cliente non lo vede più." : "Report pubblicato: ora il cliente lo vede.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function importSheet(file: File | undefined) {
    if (!file) return;
    if (!SHEET_EXTENSION.test(file.name)) return void toast.error("Carica un file .xlsx, .ods o .csv con due colonne: nome della metrica e valore.");
    setBusy("import");
    try {
      const storageId = (await uploadToStorage(await uploadUrl({}), file)) as Id<"_storage">;
      const { sheets } = await readSheet({ storageId, fileName: file.name });
      const { matched, unmatched } = matchSheetRows(sheets[0]?.rows ?? []);
      if (matched.length > 0) {
        setValues((s) => ({ ...s, ...Object.fromEntries(matched.map((m) => [m.key, String(m.value).replace(".", ",")])) }));
        touch();
      }
      toast.success(`Importate ${matched.length} metriche${unmatched.length ? `; non riconosciute: ${unmatched.slice(0, 4).join(", ")}${unmatched.length > 4 ? "…" : ""}` : ""}.`);
    } catch (error) {
      toast.error(errorMessage(error, "Non riesco a leggere il file."));
    } finally {
      setBusy(null);
    }
  }

  function addCustom() {
    const label = newLabel.trim();
    if (label === "") return void toast.error("Scrivi il nome della metrica.");
    const slug = label.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "metrica";
    let key = `custom.${slug}`;
    for (let i = 2; custom.some((c) => c.key === key); i++) key = `custom.${slug}-${i}`;
    setCustom((s) => [...s, { key, label, unit: newUnit }]);
    setNewLabel("");
    touch();
  }

  const auto = initial?.auto;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          ← Tutti i report
        </Button>
        <h2 className="font-display text-lg capitalize tracking-tight">{monthLabel(month)}</h2>
        {initial ? <Badge variant={published ? "default" : "secondary"}>{published ? "Pubblicato" : "Bozza"}</Badge> : <Badge variant="outline">Nuovo</Badge>}
        {dirty ? <Badge variant="secondary">Modifiche non salvate</Badge> : null}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void doSave()} disabled={busy !== null || !dirty}>
            {busy === "save" ? "Salvo…" : "Salva"}
          </Button>
          <Button onClick={() => void togglePublish()} disabled={busy !== null || (!initial && !dirty)}>
            {published ? "Ritira dal cliente" : "Salva e pubblica"}
          </Button>
          {initial ? (
            <Button variant="ghost" size="icon" aria-label="Elimina il report" onClick={() => (published ? setConfirmPublishedDelete(true) : setConfirmDelete(true))}>
              <Trash2 aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>

      {auto ? (
        <section aria-label="Numeri calcolati dal portale" className="rounded-2xl bg-muted/50 p-4 text-sm">
          <p className="font-medium">Calcolati in automatico dal portale (non da inserire)</p>
          <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Incassato nel mese</dt><dd>{formatCents(auto.paidCents)} ({auto.paidCount} fatture)</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Fatture emesse</dt><dd>{auto.invoicesIssued}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Aggiornamenti di progetto</dt><dd>{auto.projectUpdates}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Documenti consegnati</dt><dd>{auto.documentsDelivered}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Abbonamenti attivi</dt><dd>{auto.activeSubscriptions} ({formatCents(auto.monthlyRecurringCents)}/mese)</dd></div>
          </dl>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor="r-summary" className="text-sm font-medium">Commento del mese</label>
          <Textarea id="r-summary" rows={6} maxLength={4000} value={summary} onChange={(e) => { setSummary(e.target.value); touch(); }} placeholder="Come è andato il mese, cosa abbiamo fatto, risultati principali…" />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="r-next" className="text-sm font-medium">Prossimi passi</label>
          <Textarea id="r-next" rows={6} maxLength={2000} value={nextSteps} onChange={(e) => { setNextSteps(e.target.value); touch(); }} placeholder="Cosa faremo il mese prossimo…" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-card p-3 ring-1 ring-foreground/10">
        <p className="text-sm">
          <span className="font-medium">{filled}</span> metriche compilate. Apri i servizi del cliente e inserisci solo i numeri che hai.
        </p>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm ring-1 ring-foreground/15 hover:bg-muted">
          <FileSpreadsheet aria-hidden className="size-4" /> {busy === "import" ? "Leggo…" : "Importa da Excel / CSV"}
          <input type="file" accept=".xlsx,.xlsm,.ods,.csv,.tsv" className="sr-only" disabled={busy !== null} onChange={(e) => { void importSheet(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <p className="w-full text-xs text-muted-foreground">Il file deve avere il nome della metrica nella prima colonna e il valore nella seconda (es. «Visite al sito» | 1520).</p>
      </div>

      {METRIC_CATALOG.map((g) => {
        const used = g.metrics.filter((m) => values[m.key] !== undefined && values[m.key] !== "").length;
        return (
          <details key={g.id} open={used > 0} className="rounded-2xl bg-card ring-1 ring-foreground/10">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
              {g.label} {used > 0 ? <Badge variant="secondary">{used}</Badge> : null}
            </summary>
            <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
              {g.metrics.map((m) => (
                <MetricInput key={m.key} id={`m-${m.key}`} label={m.label} unit={m.unit} value={values[m.key] ?? ""} previous={prevValue.get(m.key)} note={notes[m.key] ?? ""} onChange={(v) => setValue(m.key, v)} onNote={(n) => { setNotes((s) => ({ ...s, [m.key]: n })); touch(); }} />
              ))}
            </div>
          </details>
        );
      })}

      <details open={custom.length > 0} className="rounded-2xl bg-card ring-1 ring-foreground/10">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Altre metriche (personalizzate)</summary>
        <div className="space-y-3 px-4 pb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {custom.map((c) => (
              <MetricInput key={c.key} id={`m-${c.key}`} label={c.label} unit={c.unit} value={values[c.key] ?? ""} previous={prevValue.get(c.key)} note={notes[c.key] ?? ""} onChange={(v) => setValue(c.key, v)} onNote={(n) => { setNotes((s) => ({ ...s, [c.key]: n })); touch(); }} />
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <label htmlFor="c-label" className="text-xs">Nome della nuova metrica</label>
              <Input id="c-label" value={newLabel} maxLength={80} onChange={(e) => setNewLabel(e.target.value)} className="w-64" />
            </div>
            <div className="grid gap-1">
              <label htmlFor="c-unit" className="text-xs">Tipo di valore</label>
              <NativeSelect id="c-unit" value={newUnit} onChange={(e) => setNewUnit(e.target.value as MetricUnit)} className="w-44">
                {UNITS.map((u) => (
                  <option key={u} value={u}>{UNIT_LABEL[u]}</option>
                ))}
              </NativeSelect>
            </div>
            <Button type="button" variant="outline" onClick={addCustom}>
              <Plus aria-hidden /> Aggiungi
            </Button>
          </div>
        </div>
      </details>

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminare il report?"
        description={`Il report di ${monthLabel(month)} verrà cancellato per sempre.`}
        confirmLabel="Elimina"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void remove({ clientId, month }).then(onBack).catch((e: unknown) => toast.error(errorMessage(e)));
        }}
      />
      <ConfirmDialog
        open={confirmPublishedDelete}
        title="Questo report è visibile al cliente"
        description={`Eliminando il report di ${monthLabel(month)} il cliente non potrà più vederlo né scaricarlo. Vuoi eliminarlo comunque?`}
        confirmLabel="Elimina comunque"
        destructive
        onCancel={() => setConfirmPublishedDelete(false)}
        onConfirm={() => {
          setConfirmPublishedDelete(false);
          void remove({ clientId, month, confirmPublished: true }).then(onBack).catch((e: unknown) => toast.error(errorMessage(e)));
        }}
      />
    </div>
  );
}

function MetricInput({ id, label, unit, value, previous, note, onChange, onNote }: { id: string; label: string; unit: MetricUnit; value: string; previous: number | undefined; note: string; onChange: (v: string) => void; onNote: (n: string) => void }) {
  const n = toNumber(value);
  const delta = n !== null ? metricDelta(n, previous, unit) : null;
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={previous !== undefined ? `mese prima: ${formatMetricValue(previous, unit)}` : UNIT_LABEL[unit]} />
      {delta ? <p className="text-[11px] text-muted-foreground">{delta.text} rispetto al mese prima</p> : null}
      {n !== null ? <Input aria-label={`Nota per ${label}`} value={note} maxLength={200} onChange={(e) => onNote(e.target.value)} placeholder="Nota (facoltativa, es. fonte del dato)" className="h-7 text-xs" /> : null}
    </div>
  );
}
