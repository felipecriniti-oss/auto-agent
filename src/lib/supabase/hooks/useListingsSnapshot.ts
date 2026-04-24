"use client";

/**
 * useListingsSnapshot — snapshot of the most recent 500 listings used by the
 * Wishlist preview pane (Phase 7) to count live match candidates as the
 * lojista types.
 *
 * D-01 (silent mock fallback): when Supabase returns `[]`, the hook transparently
 * returns `PREVIEW_LISTINGS` — the same code path serves dev (empty DB), Vercel
 * preview, and prod-day-1 (empty `listings` table) without any conditional
 * branching in consumers. Consumers never know whether they are seeing real or
 * mock data — they just get a `DbListing[]`.
 *
 * Design notes:
 * - Listings are global (not user-scoped) — the query intentionally has no
 *   `.eq("user_id", ...)`. The React Query key still includes `user?.id` so
 *   multi-tab / multi-tenant sessions do not share a cache key (Pitfall 2 in
 *   07-RESEARCH.md — avoid stale cross-tenant flashes).
 * - staleTime 60s per UI-SPEC §Preview pane — the count is advisory, not
 *   a source of truth.
 * - D-09 applies: refetch on window focus and on reconnect. No Supabase
 *   realtime channel — the React Query poll is sufficient for P7.
 * - L4 compliance: React Query only. No SWR imports.
 */

import { PREVIEW_LISTINGS } from "@/lib/mock-data/preview-listings";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { DbListing } from "@/types/database";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useSupabaseUser } from "./useSupabaseUser";

const LISTINGS_SNAPSHOT_KEY = ["supabase", "listings-snapshot"] as const;

async function fetchListingsSnapshot(): Promise<DbListing[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .limit(500)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!data || data.length === 0) {
    return PREVIEW_LISTINGS;
  }
  return data;
}

export function useListingsSnapshot(): UseQueryResult<DbListing[]> {
  const { user } = useSupabaseUser();
  const enabled = isSupabaseConfigured() && !!user;

  return useQuery({
    queryKey: [...LISTINGS_SNAPSHOT_KEY, user?.id ?? "anon"],
    queryFn: fetchListingsSnapshot,
    enabled,
    // Degraded path: unauth / unconfigured sessions still see mocks so the
    // preview pane works before a user signs up (onboarding step 3).
    initialData: enabled ? undefined : PREVIEW_LISTINGS,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
