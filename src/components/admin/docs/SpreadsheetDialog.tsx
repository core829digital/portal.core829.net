"use client";

import { useAction, useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Field, NativeSelect, TextField } from "@/components/admin/Field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { uploadToStorage } from "@/lib/upload";

export type SheetData = { name: string; rows: string[][]; truncated: boolean };
export const SHEET_EXTENSION = /\.(xlsx|xlsm|ods|csv|tsv)$/i;

/** Anteprima di una tabella (prime righe) con l'intestazione evidenziata. */
export function SheetPreview({ rows, header }: { rows: string[][]; header: boolean }) {
  const shown = rows.slice(0, 8);
  return (
    <div className="max-h-56 overflow-auto rounded-xl ring-1 ring-foreground/10">
      <table className="w-full min-w-max border-collapse text-xs">
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} className={header && i === 0 ? "bg-muted font-semibold" : undefined}>
              {r.map((c, j) => (
                <td key={j} className="max-w-48 truncate border border-foreground/10 px-2 py-1">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length ? <p className="px-2 py-1 text-[11px] text-muted-foreground">… e altre {rows.length - shown.length} righe</p> : null}
    </div>
  );
}

/** Carica un foglio di calcolo, fa scegliere il foglio e restituisce la tabella da inserire nel documento. */
export function SpreadsheetDialog({
  paragraphCount,
  defaultAfter,
  onClose,
  onInsert,
}: {
  paragraphCount: number;
  defaultAfter: number;
  onClose: () => void;
  onInsert: (table: { after: number; header: boolean; rows: string[][] }) => void;
}) {
  const uploadUrl = useMutation(api.docStudio.uploadUrl);
  const read = useAction(api.docStudioActions.readSpreadsheet);
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [header, setHeader] = useState(true);
  const [pending, setPending] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!SHEET_EXTENSION.test(file.name)) return void toast.error("Carica un file .xlsx, .xlsm, .ods o .csv. I vecchi .xls vanno salvati come .xlsx.");
    setPending(true);
    try {
      const storageId = (await uploadToStorage(await uploadUrl({}), file)) as Id<"_storage">;
      const result = await read({ storageId, fileName: file.name });
      setSheets(result.sheets);
      setSheetIndex(0);
    } catch (error) {
      toast.error(errorMessage(error, "Non riesco a leggere il file."));
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sheet = sheets?.[sheetIndex];
    if (!sheet || sheet.rows.length === 0) return void toast.error("Il foglio scelto è vuoto.");
    const after = Math.min(Math.max(1, Number(new FormData(event.currentTarget).get("after")) || 1), paragraphCount) - 1;
    onInsert({ after, header, rows: sheet.rows });
    toast.success("Tabella aggiunta: la vedi nell'anteprima. Ricorda di salvare.");
    onClose();
  }

  const sheet = sheets?.[sheetIndex];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Inserisci una tabella da Excel</DialogTitle>
          <DialogDescription>Formati: .xlsx, .xlsm, .ods, .csv. Le formule non si calcolano: si legge l&apos;ultimo valore salvato. Massimo 5 MB, 2000 righe, 50 colonne.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field id="sheetFile" label="File">
            <input id="sheetFile" type="file" accept=".xlsx,.xlsm,.ods,.csv,.tsv" disabled={pending} onChange={(e) => void onFile(e.target.files?.[0])} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm" />
          </Field>
          {pending ? <p className="text-sm text-muted-foreground" aria-live="polite">Lettura del file…</p> : null}
          {sheets && sheet ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="sheetName" label="Foglio">
                  <NativeSelect id="sheetName" name="sheetName" value={String(sheetIndex)} onChange={(e) => setSheetIndex(Number(e.target.value))}>
                    {sheets.map((s, i) => (
                      <option key={i} value={i}>
                        {s.name} ({s.rows.length} righe)
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <TextField id="after" label="Inserisci dopo il paragrafo n." type="number" min={1} max={paragraphCount} defaultValue={defaultAfter + 1} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" checked={header} onChange={(e) => setHeader(e.target.checked)} /> La prima riga è l&apos;intestazione
              </label>
              {sheet.rows.length === 0 ? <p className="text-sm text-muted-foreground">Questo foglio è vuoto.</p> : <SheetPreview rows={sheet.rows} header={header} />}
              {sheet.truncated ? <p className="text-xs text-muted-foreground">Il foglio è più grande dei limiti: è stato tagliato.</p> : null}
            </>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={!sheet || sheet.rows.length === 0 || pending}>
              Inserisci la tabella
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
