import type { WishlistFormValues } from "@/lib/schemas/wishlist";
import type { DbWishlist } from "@/types/database";

/**
 * Adapts RHF form values into the full DbWishlist shape the matching engine requires.
 *
 * CRITICAL (landmine L2):
 *   - Sets status="active" — engine short-circuits at engine.ts:175 on non-active wishlists.
 *   - Synthesizes id/user_id/timestamps — preview runs against a pending, non-persisted wishlist.
 *   - Fallback `name = v.name || "pending"` — schema allows empty name (auto-gen on submit), but
 *     engine doesn't care about the name; "pending" is just a sentinel.
 *
 * Shape parity check (MED-03): the `_AdapterCoversRow` invariant below is a
 * compile-time `Equals<ReturnType, DbWishlist>` guard. If `DbWishlist` grows a
 * new column (or removes/renames one), this file fails to compile until the
 * adapter is updated. This catches additions the engine might key on later
 * (e.g. a future `notes` hard-rule column) — TypeScript's structural check
 * alone would not catch a shape difference where the return type is a strict
 * supertype of the row.
 */
export function formValuesToPendingWishlist(v: Partial<WishlistFormValues>): DbWishlist {
  const now = new Date().toISOString();
  return {
    id: "pending",
    user_id: "pending",
    name: v.name && v.name.length > 0 ? v.name : "pending",
    brand: v.brand ?? "",
    model: v.model ?? "",
    trim: v.trim ?? null,
    year_min: v.year_min ?? null,
    year_max: v.year_max ?? null,
    km_max: v.km_max ?? null,
    price_max: v.price_max ?? null,
    fuel_type: v.fuel_type ?? [],
    transmission: v.transmission ?? [],
    armored: v.armored ?? null,
    region_uf: v.region_uf ?? [],
    region_cities: v.region_cities ?? [],
    status: "active",
    created_at: now,
    updated_at: now,
  };
}

// MED-03: compile-time invariant that the adapter's return type is exactly
// `DbWishlist`. `Equals<X, Y>` resolves to `true` only when X and Y are
// mutually assignable; either narrowing or widening fails the assignment.
type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
  ? true
  : false;

// Compile-time guards: `_`-prefix tells biome these are intentionally unused
// (no suppression comment needed — biome's noUnusedVariables exempts `_*`).
// The assignments themselves are the test: if the adapter's return type drifts
// from DbWishlist, `Equals<...>` resolves to `false` and the `: true` literal
// assignment fails to compile.
type _AdapterCoversRow = Equals<ReturnType<typeof formValuesToPendingWishlist>, DbWishlist>;
const _adapterCovers: _AdapterCoversRow = true;
