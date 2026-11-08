"use client";

import { useAction } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";

type State<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * Legge dati dal ponte con Andromedia Web (un'azione Convex) e li ricarica a richiesta.
 * Le azioni non sono "live" come le query: si ricarica dopo ogni modifica.
 */
export function useSiteData<T, Args extends Record<string, unknown>>(ref: FunctionReference<"action", "public", Args, T>, args: Args) {
  const run = useAction(ref) as unknown as (a: Args) => Promise<T>;
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const argsKey = JSON.stringify(args);
  const argsRef = useRef(args);
  argsRef.current = args;

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await run(argsRef.current);
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState((s) => ({ data: s.data, error: errorMessage(error, "Non riesco a leggere i dati del sito."), loading: false }));
    }
  }, [run]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- caricamento iniziale e al cambio degli argomenti
    void reload();
  }, [reload, argsKey]);

  return { ...state, reload };
}
