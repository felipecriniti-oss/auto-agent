"use client";

/**
 * Wishlist hooks — CRUD against public.wishlists gated by the current user.
 *
 * - useWishlists()        — list current user's wishlists (desc by created_at)
 * - useCreateWishlist()   — insert, invalidates list
 * - useUpdateWishlist()   — update by id, optimistic
 * - useDeleteWishlist()   — delete by id, optimistic
 *
 * RLS on wishlists enforces `auth.uid() = user_id`, so user_id is stamped
 * automatically from the session — callers pass the rest of the shape via
 * `WishlistInsertInput`. Returns empty array when user is not authenticated
 * instead of throwing, so modules can render a skeleton / empty state.
 */

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { DbWishlist, Tables } from "@/types/database";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabaseUser } from "./useSupabaseUser";

const WISHLISTS_KEY = ["supabase", "wishlists"] as const;

export type WishlistInsertInput = Omit<Tables["wishlists"]["Insert"], "user_id">;
export type WishlistUpdateInput = Tables["wishlists"]["Update"];

async function fetchWishlists(userId: string): Promise<DbWishlist[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from("wishlists")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "archived") // D-14: soft-delete filter
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function useWishlists() {
  const { user } = useSupabaseUser();
  const enabled = isSupabaseConfigured() && !!user;

  return useQuery({
    queryKey: [...WISHLISTS_KEY, user?.id ?? "anon"],
    queryFn: () => fetchWishlists(user?.id ?? ""),
    enabled,
    initialData: enabled ? undefined : [],
    staleTime: 30_000, // D-09: 30s stale window, no realtime subscription
    refetchOnWindowFocus: true, // D-09: multi-device freshness on focus
    refetchOnReconnect: true, // D-09: refresh when network comes back (MED-02)
  });
}

export function useCreateWishlist() {
  const { user } = useSupabaseUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: WishlistInsertInput): Promise<DbWishlist> => {
      if (!user) throw new Error("not_authenticated");
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase
        .from("wishlists")
        .insert({ ...input, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...WISHLISTS_KEY, user?.id ?? "anon"] });
    },
  });
}

export function useUpdateWishlist() {
  const { user } = useSupabaseUser();
  const queryClient = useQueryClient();
  const key = [...WISHLISTS_KEY, user?.id ?? "anon"];

  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: WishlistUpdateInput;
    }): Promise<DbWishlist> => {
      if (!user) throw new Error("not_authenticated");
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase
        .from("wishlists")
        .update(patch)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DbWishlist[]>(key);
      if (previous) {
        queryClient.setQueryData<DbWishlist[]>(
          key,
          previous.map((w) =>
            w.id === id ? { ...w, ...patch, updated_at: new Date().toISOString() } : w,
          ),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useDeleteWishlist() {
  const { user } = useSupabaseUser();
  const queryClient = useQueryClient();
  const key = [...WISHLISTS_KEY, user?.id ?? "anon"];

  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      if (!user) throw new Error("not_authenticated");
      const supabase = getSupabaseBrowser();
      const { error } = await supabase
        .from("wishlists")
        .update({ status: "archived" }) // D-14: soft delete
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
      return id;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DbWishlist[]>(key);
      if (previous) {
        queryClient.setQueryData<DbWishlist[]>(
          key,
          previous.filter((w) => w.id !== id),
        );
      }
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
