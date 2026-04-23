"use client";

/**
 * React Query provider — wraps the app in a single QueryClient so every
 * component tree gets the same cache, invalidation, and realtime-invalidation
 * plumbing.
 *
 * Defaults:
 *   - staleTime 30s       → UI doesn't refetch aggressively when the user
 *                           tabs back; Supabase realtime subscriptions on
 *                           opportunities / deals handle freshness.
 *   - refetchOnWindowFocus false → same reason; realtime is the source of
 *                           truth, windowFocus was producing jitter.
 *   - retry 1             → transient Supabase 5xx retries once, then bubbles.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

export function ReactQueryProvider({ children }: { children: ReactNode }) {
  // useState to ensure a single client per mounted tree; survives HMR and
  // avoids leaking state across Next.js server/client boundary transitions.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
