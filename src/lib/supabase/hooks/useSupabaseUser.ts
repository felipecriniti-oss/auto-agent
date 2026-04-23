"use client";

/**
 * useSupabaseUser — single source of truth for the current auth session on
 * the client.
 *
 * Approach:
 *   - React Query caches the session under key ["supabase", "session"].
 *   - onAuthStateChange listener invalidates the cache on SIGNED_IN /
 *     SIGNED_OUT / TOKEN_REFRESHED so every component wired to this hook
 *     re-renders with the fresh user.
 *   - Callers don't need to subscribe themselves — the hook handles it.
 *   - `signOut` clears session and invalidates the cache; middleware picks
 *     up the cleared cookie on the next navigation.
 *
 * Returns { user, isLoading, signOut }.
 */

import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getSupabaseBrowser } from "../client";

const SESSION_KEY = ["supabase", "session"] as const;

async function fetchCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

export function useSupabaseUser(): {
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
} {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: SESSION_KEY,
    queryFn: fetchCurrentUser,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowser();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      // Any auth event → invalidate the cached session.
      queryClient.invalidateQueries({ queryKey: SESSION_KEY });
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const signOut = async (): Promise<void> => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    queryClient.setQueryData(SESSION_KEY, null);
    queryClient.invalidateQueries({ queryKey: SESSION_KEY });
  };

  return {
    user: data ?? null,
    isLoading,
    signOut,
  };
}
