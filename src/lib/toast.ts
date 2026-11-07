/**
 * Notifiche brevi ("toast"). Volutamente senza librerie esterne: quella usata in precedenza
 * inseriva un blocco di stile senza nonce, che la nostra Content-Security-Policy blocca.
 * I messaggi sono solo testo: React li mostra con l'escape, nessun HTML.
 */

export type ToastKind = "success" | "error";
export type ToastItem = { id: number; kind: ToastKind; message: string };

const MAX_VISIBLE = 4;
const MAX_LENGTH = 300;
const EMPTY: ToastItem[] = [];

let items: ToastItem[] = EMPTY;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): ToastItem[] {
  return items;
}

export function getServerSnapshot(): ToastItem[] {
  return EMPTY;
}

export function dismiss(id: number): void {
  items = items.filter((i) => i.id !== id);
  emit();
}

/** Svuota tutto (usata nei test). */
export function clearAll(): void {
  items = EMPTY;
  emit();
}

function push(kind: ToastKind, message: string): number {
  const id = nextId++;
  items = [...items, { id, kind, message: message.slice(0, MAX_LENGTH) }].slice(-MAX_VISIBLE);
  emit();
  // Gli errori restano piu' a lungo, cosi' si fanno leggere.
  setTimeout(() => dismiss(id), kind === "error" ? 8000 : 4000);
  return id;
}

export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
};
