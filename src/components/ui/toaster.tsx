"use client";

import { X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { dismiss, getServerSnapshot, getSnapshot, subscribe } from "@/lib/toast";

export function Toaster() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
      {items.map((item) => (
        <div
          key={item.id}
          role={item.kind === "error" ? "alert" : "status"}
          className={
            "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg " +
            (item.kind === "error"
              ? "border-destructive/40 bg-background text-destructive"
              : "border-border bg-background text-foreground")
          }
        >
          <p className="flex-1 break-words">{item.message}</p>
          <button
            type="button"
            onClick={() => dismiss(item.id)}
            aria-label="Chiudi notifica"
            className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
