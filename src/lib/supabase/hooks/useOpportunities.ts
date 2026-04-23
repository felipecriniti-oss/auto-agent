"use client";

/**
 * Opportunity hooks — READ-ONLY (opportunities are created by the matching
 * engine, never by the UI).
 *
 * - useOpportunities({ status? }) — list from opportunities_enriched view
 *   (joined w/ listing + wishlist + thread). Subscribes realtime on the
 *   `opportunities` table for the current user and invalidates on any
 *   INSERT/UPDATE/DELETE, which forces React Query to refetch the enriched
 *   view (view itself isn't realtime-enabled but its base table is).
 * - useOpportunity(id) — single opportunity (enriched).
 */

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { DbOpportunityEnriched, OpportunityStatus } from "@/types/database";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSupabaseUser } from "./useSupabaseUser";

const OPPORTUNITIES_KEY = ["supabase", "opportunities"] as const;

async function fetchOpportunities(
  userId: string,
  status?: OpportunityStatus,
): Promise<DbOpportunityEnriched[]> {
  const supabase = getSupabaseBrowser();
  let query = supabase
    .from("opportunities_enriched")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DbOpportunityEnriched[];
}

async function fetchOpportunity(userId: string, id: string): Promise<DbOpportunityEnriched | null> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from("opportunities_enriched")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as DbOpportunityEnriched | null;
}

export function useOpportunities(opts: { status?: OpportunityStatus } = {}) {
  const { user } = useSupabaseUser();
  const queryClient = useQueryClient();
  const enabled = isSupabaseConfigured() && !!user;
  const key = [...OPPORTUNITIES_KEY, user?.id ?? "anon", opts.status ?? "all"] as const;

  useEffect(() => {
    if (!enabled || !user) return;
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`opportunities:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "opportunities",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: [...OPPORTUNITIES_KEY, user.id] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, user, queryClient]);

  return useQuery({
    queryKey: key,
    queryFn: () => fetchOpportunities(user?.id ?? "", opts.status),
    enabled,
    initialData: enabled ? undefined : [],
  });
}

export function useOpportunity(id: string | null | undefined) {
  const { user } = useSupabaseUser();
  const enabled = isSupabaseConfigured() && !!user && !!id;

  return useQuery({
    queryKey: [...OPPORTUNITIES_KEY, user?.id ?? "anon", "single", id ?? ""] as const,
    queryFn: () => fetchOpportunity(user?.id ?? "", id ?? ""),
    enabled,
  });
}
