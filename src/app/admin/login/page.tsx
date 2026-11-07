import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata: Metadata = { title: "Accesso amministratore" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-surface px-4 py-16">
      <div className="reveal w-full max-w-sm rounded-3xl bg-card p-6 ring-1 ring-foreground/10 shadow-(--shadow-lift) sm:p-8">
        <Link href="/" aria-label="CORE829, pagina iniziale" className="inline-block">
          <Image src="/brand/core829-logo.webp" alt="CORE829" width={120} height={32} priority unoptimized className="h-8 w-auto" />
        </Link>
        <p className="mt-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-brand-deep">
          <span aria-hidden className="h-px w-8 bg-primary" />
          Area amministrazione
        </p>
        <h1 className="mt-3 font-display text-2xl tracking-tight">Accesso amministratore</h1>
        <p className="mb-6 mt-2 text-sm text-muted-foreground">
          Inserisci la tua email: ti invieremo un codice per accedere. Nessuna password.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
