"use client";

import { useMutation, useQuery } from "convex/react";
import { Download, Eye, EyeOff, Trash2, Upload } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { ALLOWED_EXTENSIONS, MAX_FILE_BYTES, extensionOf } from "@convex/lib/files";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Field, NativeSelect, TextField } from "@/components/admin/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/errors";
import { formatBytes, formatDate } from "@/lib/format";
import { documentKindLabel } from "@/lib/labels";
import { toast } from "@/lib/toast";

type Document = Doc<"documents">;
const scanLabel = { pending: "In controllo", clean: "Pulito", rejected: "Respinto" } as const;
const MAX_MB = MAX_FILE_BYTES / (1024 * 1024);

function DownloadButton({ documentId }: { documentId: Id<"documents"> }) {
  const url = useQuery(api.documents.adminUrl, { documentId });
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[0.8rem] font-medium hover:bg-muted"
    >
      <Download className="size-3.5" aria-hidden /> Scarica
    </a>
  );
}

function UploadDialog({ clientId, onClose }: { clientId: Id<"clients">; onClose: () => void }) {
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const finalize = useMutation(api.documents.finalize);
  const projects = useQuery(api.projects.listByClient, { clientId });
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return void toast.error("Scegli un file.");
    // Controlli di cortesia: quelli che contano sono sul server, che non si fida di questi.
    if (!ALLOWED_EXTENSIONS.includes(extensionOf(file.name))) return void toast.error(`Tipo non ammesso. Sono ammessi: ${ALLOWED_EXTENSIONS.join(", ")}.`);
    if (file.size > MAX_FILE_BYTES) return void toast.error(`Il file supera i ${MAX_MB} MB consentiti.`);
    const kind = form.get("kind");
    if (kind !== "contract" && kind !== "quote" && kind !== "invoice" && kind !== "deliverable" && kind !== "other") return;
    const projectId = String(form.get("projectId") ?? "");

    setPending(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      if (!response.ok) throw new Error("upload");
      const body: unknown = await response.json();
      const storageId = typeof body === "object" && body !== null && "storageId" in body ? (body as { storageId: unknown }).storageId : null;
      if (typeof storageId !== "string") throw new Error("upload");

      const result = await finalize({
        clientId,
        storageId: storageId as Id<"_storage">,
        fileName: file.name,
        title: String(form.get("title") ?? "") || file.name,
        kind,
        projectId: projectId === "" ? undefined : (projectId as Id<"projects">),
        visibleToClient: form.get("visibleToClient") === "on",
      });
      if (!result.ok) return void toast.error(result.message);
      toast.success("File caricato: lo stiamo controllando. Tra pochi secondi risulterà «Pulito».");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Caricamento non riuscito. Riprova."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Carica un documento</DialogTitle>
          <DialogDescription>
            PDF, PNG, JPEG, DOCX o XLSX, fino a {MAX_MB} MB. Prima di renderlo disponibile controlliamo il contenuto del file.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <Field id="file" label="File">
            <Input id="file" name="file" type="file" accept={ALLOWED_EXTENSIONS.join(",")} required />
          </Field>
          <TextField id="title" label="Titolo" maxLength={120} placeholder="es. Contratto di sviluppo sito" hint="Se lo lasci vuoto si usa il nome del file." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="kind" label="Tipo">
              <NativeSelect id="kind" name="kind" defaultValue="contract">
                {Object.entries(documentKindLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="projectId" label="Progetto" hint="Facoltativo.">
              <NativeSelect id="projectId" name="projectId" defaultValue="">
                <option value="">Nessuno</option>
                {(projects ?? []).map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="visibleToClient" defaultChecked className="size-4" />
            Visibile al cliente (solo dopo il controllo)
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Caricamento…" : "Carica"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentsPanel({ clientId }: { clientId: Id<"clients"> }) {
  const documents = useQuery(api.documents.listByClient, { clientId });
  const setVisibility = useMutation(api.documents.setVisibility);
  const removeDocument = useMutation(api.documents.remove);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Document | null>(null);

  return (
    <section aria-labelledby="docs-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 id="docs-title" className="text-lg font-semibold">
            Documenti
          </h2>
          <p className="text-sm text-muted-foreground">
            Il cliente vede solo i documenti <strong>puliti</strong> e <strong>visibili</strong>, dopo aver inserito il codice ricevuto via
            email. Ogni file viene controllato prima di essere reso disponibile.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload aria-hidden /> Carica documento
        </Button>
      </div>

      {documents === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : documents.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nessun documento ancora.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Caricato</TableHead>
                <TableHead>Controllo</TableHead>
                <TableHead className="sr-only">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((d) => (
                <TableRow key={d._id}>
                  <TableCell>
                    <div className="font-medium">{d.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.fileName} · {formatBytes(d.sizeBytes)}
                    </div>
                  </TableCell>
                  <TableCell>{documentKindLabel[d.kind]}</TableCell>
                  <TableCell>{formatDate(d._creationTime)}</TableCell>
                  <TableCell>
                    <Badge variant={d.scanStatus === "clean" ? "default" : d.scanStatus === "rejected" ? "destructive" : "secondary"}>
                      {scanLabel[d.scanStatus]}
                    </Badge>
                    {d.scanStatus === "rejected" && d.rejectReason ? <p className="mt-1 max-w-64 text-xs text-destructive">{d.rejectReason}</p> : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      {d.scanStatus === "clean" ? <DownloadButton documentId={d._id} /> : null}
                      {d.scanStatus === "clean" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void setVisibility({ documentId: d._id, visibleToClient: !d.visibleToClient }).catch((e: unknown) => toast.error(errorMessage(e)));
                          }}
                        >
                          {d.visibleToClient ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
                          {d.visibleToClient ? "Visibile" : "Nascosto"}
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" aria-label={`Elimina ${d.title}`} onClick={() => setToDelete(d)}>
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {uploadOpen ? <UploadDialog clientId={clientId} onClose={() => setUploadOpen(false)} /> : null}
      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminare il documento?"
        description={`«${toDelete?.title ?? ""}» verrà cancellato per sempre, insieme al file. Non si può annullare.`}
        confirmLabel="Elimina"
        destructive
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) {
            void removeDocument({ documentId: toDelete._id })
              .then(() => toast.success("Documento eliminato."))
              .catch((e: unknown) => toast.error(errorMessage(e)));
          }
          setToDelete(null);
        }}
      />
    </section>
  );
}
