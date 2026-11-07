"use client";

import { useMutation, useQuery } from "convex/react";
import { MessageSquarePlus, Pencil, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Field, NativeSelect, TextField } from "@/components/admin/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { dateInputToTimestamp, formatDate, formatDateTime, timestampToDateInput } from "@/lib/format";
import { projectStatusLabel } from "@/lib/labels";
import { toast } from "@/lib/toast";

type Project = Doc<"projects">;
type ProjectStatus = Project["status"];

function isProjectStatus(v: unknown): v is ProjectStatus {
  return typeof v === "string" && v in projectStatusLabel;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Avanzamento del progetto"
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
      <span className="w-10 text-right text-sm tabular-nums">{value}%</span>
    </div>
  );
}

function ProjectDialog({
  open,
  onClose,
  clientId,
  project,
}: {
  open: boolean;
  onClose: () => void;
  clientId: Id<"clients">;
  project: Project | null;
}) {
  const create = useMutation(api.projects.create);
  const update = useMutation(api.projects.update);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const status = form.get("status");
    if (!isProjectStatus(status)) return;
    const description = String(form.get("description") ?? "").trim();
    const start = String(form.get("startDate") ?? "");
    const due = String(form.get("dueDate") ?? "");
    const startDate = start === "" ? null : dateInputToTimestamp(start);
    const dueDate = due === "" ? null : dateInputToTimestamp(due);
    const progress = Number(form.get("progress"));
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      toast.error("L'avanzamento è un numero intero da 0 a 100.");
      return;
    }
    setPending(true);
    try {
      const name = String(form.get("name") ?? "");
      if (project) {
        await update({ projectId: project._id, name, description: description === "" ? null : description, status, progress, startDate, dueDate });
        toast.success("Progetto aggiornato.");
      } else {
        await create({
          clientId,
          name,
          description: description === "" ? undefined : description,
          status,
          progress,
          startDate: startDate ?? undefined,
          dueDate: dueDate ?? undefined,
        });
        toast.success("Progetto creato.");
      }
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "Modifica progetto" : "Nuovo progetto"}</DialogTitle>
          <DialogDescription>Il cliente vedrà nome, descrizione, stato, avanzamento e scadenza.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <TextField id="name" label="Nome del progetto" defaultValue={project?.name ?? ""} required maxLength={120} autoFocus />
          <Field id="description" label="Descrizione" hint="Facoltativa.">
            <Textarea id="description" name="description" defaultValue={project?.description ?? ""} maxLength={2000} rows={3} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="status" label="Stato">
              <NativeSelect id="status" name="status" defaultValue={project?.status ?? "planned"}>
                {Object.entries(projectStatusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <TextField id="progress" label="Avanzamento (%)" type="number" min={0} max={100} step={1} defaultValue={project?.progress ?? 0} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="startDate" label="Inizio" type="date" defaultValue={timestampToDateInput(project?.startDate)} />
            <TextField id="dueDate" label="Consegna prevista" type="date" defaultValue={timestampToDateInput(project?.dueDate)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvataggio…" : "Salva"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UpdateDialog({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const addUpdate = useMutation(api.projects.addUpdate);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      await addUpdate({
        projectId: project._id,
        title: String(form.get("title") ?? ""),
        body: String(form.get("body") ?? ""),
        visibleToClient: form.get("visibleToClient") === "on",
      });
      toast.success("Aggiornamento aggiunto.");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={project !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuovo aggiornamento</DialogTitle>
          <DialogDescription>{project?.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <TextField id="title" label="Titolo" required maxLength={120} autoFocus placeholder="es. Bozza pronta" />
          <Field id="body" label="Testo">
            <Textarea id="body" name="body" required maxLength={2000} rows={4} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="visibleToClient" defaultChecked className="size-4" />
            Mostra al cliente
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvataggio…" : "Aggiungi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectCard({ project, onEdit, onAddUpdate }: { project: Project; onEdit: () => void; onAddUpdate: () => void }) {
  const updates = useQuery(api.projects.updatesByProject, { projectId: project._id });
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{project.name}</CardTitle>
          {project.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{project.description}</p> : null}
        </div>
        <Badge variant={project.status === "completed" ? "default" : "secondary"}>{projectStatusLabel[project.status]}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <ProgressBar value={project.progress} />
        <p className="text-sm text-muted-foreground">
          Inizio: {formatDate(project.startDate)} · Consegna prevista: {formatDate(project.dueDate)}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil aria-hidden /> Modifica
          </Button>
          <Button variant="outline" size="sm" onClick={onAddUpdate}>
            <MessageSquarePlus aria-hidden /> Aggiungi aggiornamento
          </Button>
        </div>
        {updates && updates.length > 0 ? (
          <ul className="space-y-2 border-t pt-3">
            {updates.slice(0, 5).map((u) => (
              <li key={u._id} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{u.title}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(u._creationTime)}</span>
                  {!u.visibleToClient ? <Badge variant="outline">Nascosto al cliente</Badge> : null}
                </div>
                <p className="whitespace-pre-wrap text-muted-foreground">{u.body}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ProjectsPanel({ clientId }: { clientId: Id<"clients"> }) {
  const projects = useQuery(api.projects.listByClient, { clientId });
  const [dialog, setDialog] = useState<{ project: Project | null } | null>(null);
  const [updateFor, setUpdateFor] = useState<Project | null>(null);

  return (
    <section aria-labelledby="projects-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="projects-title" className="text-lg font-semibold">
          Progetti
        </h2>
        <Button onClick={() => setDialog({ project: null })}>
          <Plus aria-hidden /> Nuovo progetto
        </Button>
      </div>
      {projects === undefined ? (
        <Skeleton className="h-32 w-full" />
      ) : projects.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nessun progetto ancora.</p>
      ) : (
        <div className="grid gap-4">
          {projects.map((p) => (
            <ProjectCard key={p._id} project={p} onEdit={() => setDialog({ project: p })} onAddUpdate={() => setUpdateFor(p)} />
          ))}
        </div>
      )}
      {dialog ? (
        <ProjectDialog key={dialog.project?._id ?? "new"} open clientId={clientId} project={dialog.project} onClose={() => setDialog(null)} />
      ) : null}
      <UpdateDialog project={updateFor} onClose={() => setUpdateFor(null)} />
    </section>
  );
}
