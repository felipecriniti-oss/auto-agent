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
 * Shape parity check: every field of `DbWishlist` is assigned explicitly so the TypeScript
 * typecheck acts as a guard — if the Row definition ever grows a field, this function fails
 * to compile until the new field is handled.
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
