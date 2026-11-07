/**
 * Dove vive il token del cliente nel browser.
 *
 * - Arriva nel frammento dell'URL, viene letto una volta e l'URL viene subito ripulito
 *   (`history.replaceState`): il segreto non resta visibile ne' nella barra ne' nella cronologia.
 * - Si conserva solo in sessionStorage (muore con la scheda), cosi' un aggiornamento della pagina
 *   non obbliga a riaprire il link. Mai in localStorage, mai in un cookie.
 */
import { extractToken } from "@/lib/portalLink";

const STORAGE_KEY = "portal-link";

let token: string | null | undefined; // undefined = non ancora letto
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function readSession(): string | null {
  try {
    return extractToken(window.sessionStorage.getItem(STORAGE_KEY) ?? "");
  } catch {
    return null; // storage bloccato (es. modalita' privata restrittiva)
  }
}

function writeSession(value: string) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Se non si puo' salvare, il token resta solo in memoria per questa visita.
  }
}

/** Da chiamare una volta, lato browser, dopo il primo rendering. */
export function initToken(): void {
  if (token !== undefined) return;
  const fromHash = extractToken(window.location.hash);
  if (fromHash) {
    writeSession(fromHash);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    token = fromHash;
  } else {
    token = readSession();
  }
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): string | null | undefined {
  return token;
}

export function getServerSnapshot(): undefined {
  return undefined;
}
