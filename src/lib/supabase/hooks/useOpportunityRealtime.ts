"use client";

/**
 * useOpportunityRealtime — INSERT-only realtime listener that drives
 * (a) sidebar badge increment via Zustand and (b) sonner toast UX.
 *
 * Mounted ONCE at AppShell level so toasts fire regardless of which dashboard
 * module is currently rendered. Distinct from `useOpportunities` (which has
 * its own channel for query invalidation) — the channel names do not collide.
 *
 * Debounce model (D-12 specifics + W-03 same-wishlist suppression):
 *   - Each INSERT pushes into a sliding-window event buffer.
 *   - A 200ms debounce flush absorbs realistic burst latency without
 *     delaying single-event UX noticeably.
 *   - On flush, if the buffer has ≥5 events from the last 2000ms:
 *     * If they all share the same wishlist_id → suppress entirely
 *       (the mutation toast in useCreateWishlist already informed the user).
 *     * Otherwise → ONE summary toast "Nova wishlist gerou {n} oportunidades"
 *       with the FULL buffer count.
 *   - If <5 events → fire individual toasts in order.
 *   - Badge always increments per event (independent of toast suppression).
 *
 * Toast field-name source: opportunities_enriched view exposes
 * `listing_brand` / `listing_model` / `listing_year` / `savings_pct` (NOT
 * bare `brand` / `model` / `year` — those don't exist on the view). See
 * src/types/database.ts:380-397 (B-01).
 */

import { useAppStore } from "@/lib/stores/app";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { DbOpportunityEnriched } from "@/types/database";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useSupabaseUser } from "./useSupabaseUser";

const FLUSH_DEBOUNCE_MS = 200;
const BURST_WINDOW_MS = 2000;
const BURST_THRESHOLD = 5;

type BufferedEvent = {
  id: string;
  wishlist_id: string;
  ts: number;
};

/**
 * Builds the D-12 toast title from an enriched opportunity row. Field names
 * are `listing_brand` / `listing_model` / `listing_year` / `savings_pct`
 * exactly as exposed by the `opportunities_enriched` view (B-01).
 *
 * Brand-dedup: if `listing_model` already starts with `listing_brand`
 * (case-insensitive), the brand prefix is omitted to avoid "Honda Honda
 * Civic"-style doubling. Null savings → trailing segment renders as `FIPE`.
 */
export function buildToastTitle(opp: DbOpportunityEnriched): string {
  const brand = (opp.listing_brand ?? "").trim();
  const model = (opp.listing_model ?? "").trim();
  const year = opp.listing_year ?? "";
  const display =
    brand && model.toLowerCase().startsWith(brand.toLowerCase())
      ? model
      : `${brand} ${model}`.trim();
  const savings =
    typeof opp.savings_pct === "number" ? `−${Math.round(opp.savings_pct)}% FIPE` : "FIPE";
  return `Nova oportunidade · ${display} ${year} · ${savings}`.replace(/\s+/g, " ").trim();
}

export function useOpportunityRealtime(): void {
  const { user } = useSupabaseUser();
  const enabled = isSupabaseConfigured() && !!user;
  const buffer = useRef<BufferedEvent[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !user) return;

    const supabase = getSupabaseBrowser();

    const flush = async (): Promise<void> => {
      flushTimer.current = null;
      const now = Date.now();
      // Trim sliding 2s window — drop events older than BURST_WINDOW_MS.
      const events = buffer.current.filter((e) => now - e.ts < BURST_WINDOW_MS);
      buffer.current = [];
      if (events.length === 0) return;

      if (events.length >= BURST_THRESHOLD) {
        // Same-wishlist suppression (W-03): when every event in the buffer
        // shares a wishlist_id, the mutation toast in useCreateWishlist
        // already informed the user. Drop the summary toast entirely.
        const firstWishlist = events[0].wishlist_id;
        const allSameWishlist = events.every((e) => e.wishlist_id === firstWishlist);
        if (allSameWishlist) {
          return;
        }
        toast.success(`Nova wishlist gerou ${events.length} oportunidades`, {
          duration: 6000,
        });
        return;
      }

      // 1–4 events: fire individuals in order.
      for (const ev of events) {
        const { data: enriched } = await supabase
          .from("opportunities_enriched")
          .select("*")
          .eq("id", ev.id)
          .maybeSingle();
        if (!enriched) continue;
        const e = enriched as DbOpportunityEnriched;
        toast.success(buildToastTitle(e), {
          duration: 6000,
          action: {
            label: "Ver",
            onClick: () => {
              if (typeof window !== "undefined") {
                window.location.hash = `#opportunity-${e.id}`;
              }
            },
          },
        });
      }
    };

    const channel = supabase
      .channel(`opportunities-realtime:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "opportunities",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: { new: { id: string; wishlist_id: string } }) => {
          // Always increment the badge — D-12 says badge increments per
          // event, even when individual toasts are suppressed (the badge
          // is the persistent "you have N unread" signal).
          useAppStore.getState().incrementMarketplaceUnread();

          buffer.current.push({
            id: payload.new.id,
            wishlist_id: payload.new.wishlist_id,
            ts: Date.now(),
          });

          if (flushTimer.current !== null) {
            clearTimeout(flushTimer.current);
          }
          flushTimer.current = setTimeout(() => {
            void flush();
          }, FLUSH_DEBOUNCE_MS);
        },
      )
      .subscribe();

    return () => {
      if (flushTimer.current !== null) {
        clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [enabled, user]);
}
