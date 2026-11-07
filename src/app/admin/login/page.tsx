import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata: Metadata = { title: "Accesso amministratore" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <p className="text-sm font-semibold tracking-widest text-muted-foreground">CORE829</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Accesso amministratore</h1>
        <p className="mb-6 mt-2 text-sm text-muted-foreground">
          Inserisci la tua email: ti invieremo un codice per accedere. Nessuna password.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
