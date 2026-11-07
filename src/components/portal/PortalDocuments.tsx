"use client";

import { useMutation, useQuery } from "convex/react";
import { Download, FileText, Lock } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import { ErrorBoundary } from "@/components/portal/ErrorBoundary";
import { useConvexSiteUrl } from "@/components/portal/PortalProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadFileName, formatBytes, formatDate } from "@/lib/format";
import { documentKindLabel } from "@/lib/labels";

type Phase = "locked" | "code" | "unlocked";

function DocumentList({ token, unlockToken }: { token: string; unlockToken: string }) {
  const documents = useQuery(api.portal.documents, { token, unlockToken });
  const siteUrl = useConvexSiteUrl();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Il segreto viaggia nel corpo di una richiesta POST (mai nell'indirizzo) e il file si scarica come blob. */
  async function download(doc: { id: string; fileName: string }) {
    if (!siteUrl) {
      setError("Il download non è disponibile al momento. Scrivici e ti inviamo il file.");
      return;
    }
    setBusyId(doc.id);
    setError(null);
    try {
      const response = await fetch(`${siteUrl}/portal/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, unlockToken, documentId: doc.id }),
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) throw new Error("download");
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement("a");
      link.href = url;
      link.download = downloadFileName(doc.fileName);
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("Non siamo riusciti a scaricare il file. Se il problema continua, richiedi un nuovo codice.");
    } finally {
      setBusyId(null);
    }
  }

  if (documents === undefined) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  if (documents.length === 0) return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Non ci sono ancora documenti.</p>;
  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-lg border">
        {documents.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 p-4">
            <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{d.title}</p>
              <p className="truncate text-sm text-muted-foreground">
                {documentKindLabel[d.kind]} · {d.fileName} · {formatBytes(d.sizeBytes)} · {formatDate(d.createdAt)}
              </p>
            </div>
            <Button variant="outline" size="sm" disabled={busyId === d.id} onClick={() => void download(d)}>
              <Download aria-hidden /> {busyId === d.id ? "Scarico…" : "Scarica"}
            </Button>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PortalDocuments({ token }: { token: string }) {
  const requestCode = useMutation(api.otp.requestCode);
  const verifyCode = useMutation(api.otp.verifyCode);
  const [phase, setPhase] = useState<Phase>("locked");
  const [unlockToken, setUnlockToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onRequest() {
    setPending(true);
    setMessage(null);
    try {
      const result = await requestCode({ token });
      setMessage(
        result.status === "REQUESTED"
          ? "Ti abbiamo inviato un codice di 6 cifre all'email che ci hai dato. Arriva in pochi istanti e vale 10 minuti."
          : "Hai già richiesto diversi codici. Se ne hai uno ancora valido, inseriscilo; altrimenti riprova tra qualche minuto.",
      );
      setPhase("code");
    } catch {
      setMessage("Non siamo riusciti a inviare il codice. Riprova tra poco.");
    } finally {
      setPending(false);
    }
  }

  async function onVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setPending(true);
    setMessage(null);
    try {
      const result = await verifyCode({ token, code });
      if (result.ok) {
        setUnlockToken(result.unlockToken);
        setPhase("unlocked");
        return;
      }
      if (result.reason === "INVALID_CODE") setMessage(`Codice non corretto. Tentativi rimasti: ${result.attemptsLeft}.`);
      else if (result.reason === "INVALID_FORMAT") setMessage("Il codice è formato da 6 cifre.");
      else if (result.reason === "LOCKED") setMessage("Troppi tentativi. Richiedi un nuovo codice.");
      else setMessage("Il codice è scaduto. Richiedine uno nuovo.");
    } catch {
      setMessage("Non è stato possibile verificare il codice. Riprova.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="documents-heading" className="space-y-4">
      <h2 id="documents-heading" className="text-xl font-semibold tracking-tight">
        Contratti e documenti
      </h2>

      {phase === "unlocked" && unlockToken ? (
        <ErrorBoundary
          fallback={(_error, reset) => (
            <div className="space-y-3 rounded-lg border p-5">
              <p className="text-sm">La sessione di sblocco è scaduta. Per sicurezza serve un nuovo codice.</p>
              <Button
                onClick={() => {
                  reset();
                  setUnlockToken(null);
                  setPhase("locked");
                  setMessage(null);
                }}
              >
                Richiedi un nuovo codice
              </Button>
            </div>
          )}
        >
          <DocumentList token={token} unlockToken={unlockToken} />
        </ErrorBoundary>
      ) : (
        <div className="space-y-4 rounded-lg border p-5">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-sm leading-6 text-muted-foreground">
              Per proteggere i tuoi contratti e le tue fatture, prima di mostrarli ti mandiamo un codice di 6 cifre via email.
            </p>
          </div>

          {phase === "locked" ? (
            <Button onClick={() => void onRequest()} disabled={pending}>
              {pending ? "Invio in corso…" : "Mandami il codice"}
            </Button>
          ) : (
            <form onSubmit={onVerify} className="grid max-w-xs gap-3" noValidate>
              <div className="grid gap-1.5">
                <Label htmlFor="code">Codice ricevuto</Label>
                <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" placeholder="123456" required autoFocus />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Verifica in corso…" : "Mostra i documenti"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => void onRequest()} disabled={pending}>
                Non è arrivato: invia un nuovo codice
              </Button>
            </form>
          )}

          {message ? (
            <p role="status" className="text-sm">
              {message}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
