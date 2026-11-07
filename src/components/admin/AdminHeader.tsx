"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AdminHeader() {
  const router = useRouter();
  const { signOut } = useAuthActions();
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/admin" className="flex items-baseline gap-2">
          <span className="text-xs font-semibold tracking-widest text-muted-foreground">CORE829</span>
          <span className="text-base font-semibold">Portale clienti</span>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void signOut().then(() => router.replace("/admin/login"));
          }}
        >
          <LogOut aria-hidden /> Esci
        </Button>
      </div>
    </header>
  );
}
