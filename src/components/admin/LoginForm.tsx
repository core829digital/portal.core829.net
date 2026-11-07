"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { TextField } from "@/components/admin/Field";
import { Button } from "@/components/ui/button";

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const codeSchema = z.string().trim().regex(/^[0-9]{8}$/);

export function LoginForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = emailSchema.safeParse(new FormData(event.currentTarget).get("email"));
    if (!parsed.success) {
      setError("Inserisci un indirizzo email valido.");
      return;
    }
    setPending(true);
    try {
      await signIn("resend-otp", { email: parsed.data });
      setEmail(parsed.data);
      setStep("code");
    } catch {
      setError("Non è stato possibile inviare il codice. Riprova tra poco.");
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = codeSchema.safeParse(new FormData(event.currentTarget).get("code"));
    if (!parsed.success) {
      setError("Il codice è formato da 8 cifre.");
      return;
    }
    setPending(true);
    try {
      const result = await signIn("resend-otp", { email, code: parsed.data });
      if (!result.signingIn) {
        setError("Codice non valido o scaduto.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      // Stesso messaggio per ogni causa (codice errato, scaduto, troppi tentativi).
      setError("Codice non valido o scaduto.");
    } finally {
      setPending(false);
    }
  }

  if (step === "email") {
    return (
      <form onSubmit={requestCode} className="grid gap-4" noValidate>
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          autoFocus
          placeholder="nome@core829.net"
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Invio in corso…" : "Invia il codice"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verifyCode} className="grid gap-4" noValidate>
      <p className="text-sm text-muted-foreground">
        Se l&apos;indirizzo <strong className="text-foreground">{email}</strong> è autorizzato, riceverai un codice a 8
        cifre. Vale 10 minuti.
      </p>
      <TextField
        id="code"
        label="Codice"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{8}"
        maxLength={8}
        required
        autoFocus
        placeholder="12345678"
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Verifica in corso…" : "Accedi"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setStep("email");
          setError(null);
        }}
      >
        Usa un altro indirizzo
      </Button>
    </form>
  );
}
