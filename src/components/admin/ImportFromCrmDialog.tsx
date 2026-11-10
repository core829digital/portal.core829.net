"use client";

import { useMutation } from "convex/react";
import { Upload } from "lucide-react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";

type Report = {
  dryRun: boolean; clientsCreated: number; clientsMatched: number; clientsCompleted: number; clientsSkipped: string[];
  projectsCreated: number; projectsExisting: number; invoicesCreated: number; invoicesExisting: number; invoicesSkipped: string[]; servicesIgnored: number;
};

/** Importa dal CRM (b2b.core829.net → Data → Export / Backup): anteprima, poi importazione. Non cancella nulla e non invia email. */
export function ImportFromCrmDialog() {
  const run = useMutation(api.crmImport.run);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<unknown>(null);
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(file: File | undefined) {
    setReport(null);
    if (!file) return;
    try {
      setPayload(JSON.parse(await file.text()));
      setFileName(file.name);
    } catch {
      setPayload(null);
      setFileName("");
      toast.error("Il file non è valido. Scarica l'esportazione dal CRM (Data → Export / Backup).");
    }
  }
  async function go(dryRun: boolean) {
    if (!payload) return;
    setBusy(true);
    try {
      const r = (await run({ payload, dryRun })) as Report;
      setReport(r);
      if (!dryRun) toast.success("Importazione completata.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload aria-hidden /> Importa dal CRM
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Importa dal CRM</DialogTitle>
            <DialogDescription>
              Nel CRM apri <b>Data → Export / Backup</b> e scarica il file; poi sceglilo qui. Prima vedi un&apos;anteprima, senza scrivere niente.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Non cancella nulla e si può ripetere: niente doppioni.</li>
            <li>Un cliente già presente (stessa email) viene completato, non sovrascritto.</li>
            <li>Le fatture arrivano <b>nascoste al cliente</b> e <b>nessuna email parte</b>: le rendi visibili tu.</li>
            <li>I clienti senza email valida vengono saltati.</li>
          </ul>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm hover:bg-muted/50">
            <Upload aria-hidden className="size-4 text-muted-foreground" />
            <span className={fileName ? "" : "text-muted-foreground"}>{fileName || "Scegli il file del CRM (.json)"}</span>
            <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => void load(e.target.files?.[0])} />
          </label>
          {report ? (
            <div role="status" className="space-y-2 rounded-lg border p-3 text-sm">
              <p className="font-medium">{report.dryRun ? "Anteprima — non è stato scritto ancora nulla" : "Importazione completata"}</p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                <li>Clienti nuovi: <b>{report.clientsCreated}</b></li>
                <li>Già presenti: <b>{report.clientsMatched}</b></li>
                <li>Completati: <b>{report.clientsCompleted}</b></li>
                <li>Progetti nuovi: <b>{report.projectsCreated}</b></li>
                <li>Fatture nuove: <b>{report.invoicesCreated}</b></li>
                <li>Fatture già presenti: <b>{report.invoicesExisting}</b></li>
              </ul>
              {report.clientsSkipped.length + report.invoicesSkipped.length > 0 ? (
                <details>
                  <summary className="cursor-pointer font-medium">Saltati ({report.clientsSkipped.length + report.invoicesSkipped.length})</summary>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                    {[...report.clientsSkipped, ...report.invoicesSkipped].map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {report.servicesIgnored > 0 ? <p className="text-xs text-muted-foreground">{report.servicesIgnored} servizi/preventivi del CRM non vengono importati (non sono abbonamenti).</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Chiudi
            </Button>
            <Button variant="outline" disabled={!payload || busy} onClick={() => void go(true)}>
              Anteprima
            </Button>
            <Button disabled={!payload || busy || !report?.dryRun} onClick={() => void go(false)}>
              {busy ? "Attendi…" : "Importa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
