"use client";

/**
 * useProfile — read + mutate the current user's public.users row.
 *
 * The Phase 5 AppShell read `profileName`, `profileCity`, `profilePersona`
 * from Zustand. With Phase 6 those fields move to `public.users` in
 * Supabase. This hook preserves the old API surface (name/city/loading)
 * while the underlying source of truth becomes DB-backed.
 *
 * RLS enforces `auth.uid() = id`, so any authenticated session reads only
 * its own row.
 */

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { DbUser } from "@/types/database";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabaseUser } from "./useSupabaseUser";

const PROFILE_KEY = ["supabase", "profile"] as const;

async function fetchProfile(userId: string): Promise<DbUser | null> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export function useProfile() {
  const { user } = useSupabaseUser();
  const enabled = isSupabaseConfigured() && !!user;

  return useQuery({
    queryKey: [...PROFILE_KEY, user?.id ?? "anon"],
    queryFn: () => fetchProfile(user?.id ?? ""),
    enabled,
  });
}

export function useInvalidateProfile() {
  const queryClient = useQueryClient();
  const { user } = useSupabaseUser();
  return () => {
    queryClient.invalidateQueries({ queryKey: [...PROFILE_KEY, user?.id ?? "anon"] });
  };
}
