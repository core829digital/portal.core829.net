"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Copy, Link2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Field, NativeSelect, TextField } from "@/components/admin/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/errors";
import { formatDate, formatDateTime } from "@/lib/format";

const TTL_OPTIONS = [
  { days: 7, label: "7 giorni" },
  { days: 30, label: "30 giorni" },
  { days: 90, label: "90 giorni (consigliato)" },
  { days: 180, label: "6 mesi" },
  { days: 365, label: "1 anno" },
];

export function AccessLinksPanel({ clientId, appUrl }: { clientId: Id<"clients">; appUrl: string }) {
  const links = useQuery(api.accessLinks.listByClient, { clientId });
  const createLink = useMutation(api.accessLinks.create);
  const revokeLink = useMutation(api.accessLinks.revoke);

  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<{ url: string; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [toRevoke, setToRevoke] = useState<Id<"accessLinks"> | null>(null);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const label = String(form.get("label") ?? "").trim();
    const ttlDays = Number(form.get("ttlDays"));
    setPending(true);
    try {
      const result = await createLink({ clientId, label: label === "" ? undefined : label, ttlDays });
      setCreateOpen(false);
      setCopied(false);
      // Il token esiste solo qui: dopo questa schermata non e' piu' recuperabile.
      setCreated({ url: `${appUrl.replace(/\/$/, "")}/c/${result.token}`, expiresAt: result.expiresAt });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      toast.error("Non sono riuscito a copiare: selezionalo e copialo a mano.");
    }
  }

  async function confirmRevoke() {
    if (!toRevoke) return;
    try {
      await revokeLink({ linkId: toRevoke });
      toast.success("Link revocato: smette di funzionare subito.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setToRevoke(null);
    }
  }

  return (
    <section aria-labelledby="links-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="links-title" className="text-lg font-semibold">
            Link di accesso
          </h2>
          <p className="text-sm text-muted-foreground">
            Il cliente apre il suo link e vede tutto senza login. Per contratti e fatture riceve un codice via email.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Link2 aria-hidden /> Nuovo link
        </Button>
      </div>

      {links === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : links.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nessun link ancora. Creane uno per far vedere al cliente il suo spazio.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Link</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Scade</TableHead>
                <TableHead>Ultimo accesso</TableHead>
                <TableHead className="text-right">Aperture</TableHead>
                <TableHead className="sr-only">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((link) => (
                <TableRow key={link.linkId}>
                  <TableCell>
                    <div className="font-medium">{link.label ?? "Senza nome"}</div>
                    <div className="font-mono text-xs text-muted-foreground">{link.prefix}…</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={link.active ? "default" : "secondary"}>
                      {link.active ? "Attivo" : link.revokedAt !== null && link.revokedAt < link.expiresAt ? "Revocato" : "Scaduto"}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(link.expiresAt)}</TableCell>
                  <TableCell>{formatDateTime(link.lastUsedAt)}</TableCell>
                  <TableCell className="text-right">{link.useCount}</TableCell>
                  <TableCell className="text-right">
                    {link.active ? (
                      <Button variant="outline" size="sm" onClick={() => setToRevoke(link.linkId)}>
                        Revoca
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo link di accesso</DialogTitle>
            <DialogDescription>Il link verrà mostrato una sola volta: copialo subito e invialo al cliente.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="grid gap-4">
            <TextField id="label" label="Nome (facoltativo)" maxLength={60} placeholder="es. Link per il titolare" />
            <Field id="ttlDays" label="Validità">
              <NativeSelect id="ttlDays" name="ttlDays" defaultValue="90">
                {TTL_OPTIONS.map((o) => (
                  <option key={o.days} value={o.days}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creazione…" : "Crea link"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={created !== null} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link creato</DialogTitle>
            <DialogDescription>
              Copialo adesso: per sicurezza non potrai rivederlo. Scade il {created ? formatDate(created.expiresAt) : ""}. Se lo perdi, ne crei
              uno nuovo e revochi questo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={created?.url ?? ""} aria-label="Link del cliente" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" onClick={() => created && void copy(created.url)}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copiato" : "Copia"}
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setCreated(null)}>
              Ho copiato il link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={toRevoke !== null} onOpenChange={(open) => !open && setToRevoke(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revocare questo link?</DialogTitle>
            <DialogDescription>
              Il cliente non potrà più usarlo e le sue sessioni aperte si chiuderanno subito. L&apos;azione non si annulla: se serve, crei un link nuovo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setToRevoke(null)}>
              Annulla
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmRevoke()}>
              Revoca il link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
