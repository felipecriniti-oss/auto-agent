"use client";

import type { FipeApiResponse } from "@/lib/schemas/fipe";
import { useCallback, useEffect, useRef, useState } from "react";

type LookupStatus = "idle" | "loading" | "success" | "not_found" | "upstream_failed" | "error";

interface LookupState {
  status: LookupStatus;
  fipe: number | null;
  error: string | null;
}

/**
 * Auto-fetch FIPE via POST /api/fipe. Debounced 300ms (Claude's Discretion).
 * Caller invokes `lookup({marca, modelo, ano})` — typically from onBlur handlers
 * after all 3 fields are set.
 *
 * Branching locked by tests in useFipeLookup.test.ts:
 *   200 → success, 404 → not_found, 502 → upstream_failed, other → error.
 *   AbortError is silent (state untouched).
 */
export function useFipeLookup() {
  const [state, setState] = useState<LookupState>({
    status: "idle",
    fipe: null,
    error: null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const lookup = useCallback((input: { marca: string; modelo: string; ano: number }) => {
    if (!input.marca || !input.modelo || !input.ano) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;

      setState({ status: "loading", fipe: null, error: null });
      try {
        const res = await fetch("/api/fipe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: ctl.signal,
        });
        if (res.status === 404) {
          setState({
            status: "not_found",
            fipe: null,
            error: "Anúncio não encontrado na FIPE",
          });
          return;
        }
        if (res.status === 502) {
          setState({
            status: "upstream_failed",
            fipe: null,
            error: "Serviço FIPE indisponível",
          });
          return;
        }
        if (!res.ok) {
          setState({ status: "error", fipe: null, error: `HTTP ${res.status}` });
          return;
        }
        const data = (await res.json()) as FipeApiResponse;
        setState({ status: "success", fipe: data.fipe, error: null });
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setState({ status: "error", fipe: null, error: String(err) });
      }
    }, 300);
  }, []);

  // Abort in-flight fetch + pending debounce on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  return { ...state, lookup };
}
