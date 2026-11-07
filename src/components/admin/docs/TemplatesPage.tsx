"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { FilePlus2, FileText, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Field, NativeSelect, TextField } from "@/components/admin/Field";
import { PageHeader } from "@/components/dash/DashShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { formatBytes, formatDate } from "@/lib/format";
import { docCategoryLabel } from "@/lib/labels";
import { toast } from "@/lib/toast";
import { DOCX_EXTENSION, PDF_EXTENSION, uploadToStorage } from "@/lib/upload";

type Category = keyof typeof docCategoryLabel;

function UploadTemplateDialog({ onClose }: { onClose: () => void }) {
  const uploadUrl = useMutation(api.docStudio.uploadUrl);
  const importTemplate = useAction(api.docStudioActions.importTemplate);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return void toast.error("Scegli un file DOCX.");
    if (!DOCX_EXTENSION.test(file.name)) return void toast.error("Il modello deve essere un file Word (.docx).");
    setPending(true);
    try {
      const storageId = await uploadToStorage(await uploadUrl({}), file);
      const result = await importTemplate({
        storageId: storageId as Id<"_storage">,
        name: String(form.get("name") ?? "").trim() || file.name.replace(DOCX_EXTENSION, ""),
        category: form.get("category") as Category,
      });
      toast.success(`Modello importato: ${result.paragraphs} paragrafi, ${result.fields} campi da compilare.`);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Importazione non riuscita. Controlla che sia un file .docx valido."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importa un modello</DialogTitle>
          <DialogDescription>
            Carica un file Word (.docx), per esempio il contratto quadro. Stili, intestazioni e tabelle restano come nel file; i campi da
            compilare (righe vuote, [testo tra parentesi], caselle ☐ e segnaposto {"{{client.name}}"}) vengono riconosciuti da soli.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <Field id="file" label="File DOCX">
            <Input id="file" name="file" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required />
          </Field>
          <TextField id="name" label="Nome del modello" maxLength={120} placeholder="es. Master Services Agreement (ITA)" hint="Se lo lasci vuoto si usa il nome del file." />
          <Field id="category" label="Tipo">
            <NativeSelect id="category" name="category" defaultValue="contract">
              {Object.entries(docCategoryLabel).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Importazione…" : "Importa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Crea la bozza di un cliente da un modello (o da un file caricato). Se `clientId` manca si sceglie il cliente. */
export function NewDraftDialog({ onClose, clientId, templateId }: { onClose: () => void; clientId?: Id<"clients">; templateId?: Id<"docTemplates"> }) {
  const router = useRouter();
  const templates = useQuery(api.docStudio.listTemplates, {});
  const clients = useQuery(api.clients.list, clientId ? "skip" : { paginationOpts: { numItems: 100, cursor: null } });
  const uploadUrl = useMutation(api.docStudio.uploadUrl);
  const createDraft = useAction(api.docStudioActions.createDraft);
  const createPdfDraft = useAction(api.docStudioActions.createPdfDraft);
  const [pending, setPending] = useState(false);
  const [source, setSource] = useState<"template" | "upload">("template");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const chosenClient = clientId ?? (String(form.get("clientId") ?? "") as Id<"clients">);
    if (!chosenClient) return void toast.error("Scegli il cliente.");
    setPending(true);
    try {
      let result: { draftId: Id<"docDrafts"> };
      if (source === "template") {
        const chosen = (templateId ?? String(form.get("templateId") ?? "")) as Id<"docTemplates">;
        if (!chosen) return void toast.error("Scegli un modello.");
        result = await createDraft({ clientId: chosenClient, templateId: chosen, name: String(form.get("name") ?? "").trim() || undefined });
      } else {
        const file = form.get("file");
        const isPdf = file instanceof File && PDF_EXTENSION.test(file.name);
        if (!(file instanceof File) || file.size === 0 || !(isPdf || DOCX_EXTENSION.test(file.name))) return void toast.error("Carica un file Word (.docx) o un PDF.");
        const storageId = (await uploadToStorage(await uploadUrl({}), file)) as Id<"_storage">;
        const name = String(form.get("name") ?? "").trim() || file.name.replace(/\.(docx|pdf)$/i, "");
        const category = form.get("category") as Category;
        result = isPdf
          ? await createPdfDraft({ clientId: chosenClient, uploadStorageId: storageId, name, category })
          : await createDraft({ clientId: chosenClient, uploadStorageId: storageId, name, category });
      }
      router.push(`/admin/drafts/${result.draftId}`);
    } catch (error) {
      toast.error(errorMessage(error, "Creazione non riuscita. Riprova."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuovo documento per un cliente</DialogTitle>
          <DialogDescription>Parte da un modello (con i dati del cliente già inseriti) oppure da un file Word o PDF che carichi ora.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          {!clientId ? (
            <Field id="clientId" label="Cliente">
              <NativeSelect id="clientId" name="clientId" defaultValue="" required>
                <option value="" disabled>
                  Scegli un cliente
                </option>
                {(clients?.page ?? []).map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.displayName}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
          {!templateId ? (
            <Field id="source" label="Origine">
              <NativeSelect id="source" value={source} onChange={(e) => setSource(e.target.value as "template" | "upload")}>
                <option value="template">Da un modello</option>
                <option value="upload">Da un file caricato (Word o PDF)</option>
              </NativeSelect>
            </Field>
          ) : null}
          {source === "template" && !templateId ? (
            <Field id="templateId" label="Modello">
              <NativeSelect id="templateId" name="templateId" defaultValue="" required>
                <option value="" disabled>
                  {templates === undefined ? "Caricamento…" : templates.length === 0 ? "Nessun modello: importane uno" : "Scegli un modello"}
                </option>
                {(templates ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
          {source === "upload" ? (
            <>
              <Field id="file" label="File Word (.docx) o PDF" hint="Un Word si modifica come testo e campi; un PDF si completa aggiungendo testi sopra la pagina.">
                <Input id="file" name="file" type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required />
              </Field>
              <Field id="category" label="Tipo">
                <NativeSelect id="category" name="category" defaultValue="other">
                  {Object.entries(docCategoryLabel).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </>
          ) : null}
          <TextField id="name" label="Nome del documento" maxLength={120} hint="Facoltativo: se lo lasci vuoto si usa il nome del modello e del cliente." />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Preparazione…" : "Crea e apri l'editor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Pagina "Modelli": i documenti di partenza (contratti, preventivi, documenti legali). */
export function TemplatesPage() {
  const templates = useQuery(api.docStudio.listTemplates, {});
  const archive = useMutation(api.docStudio.archiveTemplate);
  const [uploading, setUploading] = useState(false);
  const [useFor, setUseFor] = useState<Id<"docTemplates"> | null>(null);
  const [toArchive, setToArchive] = useState<{ id: Id<"docTemplates">; name: string } | null>(null);

  return (
    <>
      <PageHeader
        kicker="Documenti"
        title="Modelli"
        description="Contratti, preventivi e documenti legali da personalizzare per ogni cliente e inviare via email. Visibili solo a te."
        actions={
          <Button onClick={() => setUploading(true)}>
            <Upload aria-hidden /> Importa un modello
          </Button>
        }
      />

      {templates === undefined ? (
        <div className="space-y-2" aria-busy="true" aria-label="Caricamento">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : templates.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Nessun modello. Importa il primo file Word (per esempio il Master Services Agreement) con «Importa un modello».
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {templates.map((t, i) => (
            <li key={t.id} className="reveal flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-foreground/10 shadow-(--shadow-soft)" style={{ "--i": i } as React.CSSProperties}>
              <div className="flex items-start gap-3">
                <FileText aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
                <div className="min-w-0">
                  <h2 className="font-display text-base tracking-tight">{t.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.paragraphCount} paragrafi · {t.fieldCount} campi da compilare · {formatBytes(t.sizeBytes)} · importato il {formatDate(t.createdAt)}
                  </p>
                </div>
                <Badge variant="secondary" className="ml-auto shrink-0">
                  {docCategoryLabel[t.category]}
                </Badge>
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setUseFor(t.id)}>
                  <FilePlus2 aria-hidden /> Usa per un cliente
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setToArchive({ id: t.id, name: t.name })}>
                  Archivia
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {uploading ? <UploadTemplateDialog onClose={() => setUploading(false)} /> : null}
      {useFor ? <NewDraftDialog templateId={useFor} onClose={() => setUseFor(null)} /> : null}
      {toArchive ? (
        <ConfirmDialog
          open
          title={`Archiviare «${toArchive.name}»?`}
          description="Il modello non comparirà più nell'elenco. I documenti già creati restano."
          confirmLabel="Archivia"
          onCancel={() => setToArchive(null)}
          onConfirm={async () => {
            try {
              await archive({ templateId: toArchive.id });
              toast.success("Modello archiviato.");
            } catch (error) {
              toast.error(errorMessage(error));
            }
            setToArchive(null);
          }}
        />
      ) : null}
    </>
  );
}
