"use client";

/**
 * Deal hooks — READ-ONLY (deals are created by the Stripe webhook handler
 * in Phase 13a, never by the UI).
 *
 * - useDeals()    — list current user's deals, newest first
 * - useDeal(id)   — single deal by id
 */

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { DbDeal } from "@/types/database";
import { useQuery } from "@tanstack/react-query";
import { useSupabaseUser } from "./useSupabaseUser";

const DEALS_KEY = ["supabase", "deals"] as const;

async function fetchDeals(userId: string): Promise<DbDeal[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function fetchDeal(userId: string, id: string): Promise<DbDeal | null> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export function useDeals() {
  const { user } = useSupabaseUser();
  const enabled = isSupabaseConfigured() && !!user;

  return useQuery({
    queryKey: [...DEALS_KEY, user?.id ?? "anon"],
    queryFn: () => fetchDeals(user?.id ?? ""),
    enabled,
    initialData: enabled ? undefined : [],
  });
}

export function useDeal(id: string | null | undefined) {
  const { user } = useSupabaseUser();
  const enabled = isSupabaseConfigured() && !!user && !!id;

  return useQuery({
    queryKey: [...DEALS_KEY, user?.id ?? "anon", "single", id ?? ""] as const,
    queryFn: () => fetchDeal(user?.id ?? "", id ?? ""),
    enabled,
  });
}
