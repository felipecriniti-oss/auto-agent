/**
 * Matching engine — pure function that scores a listing against a set of
 * wishlists and returns matches that pass all hard rules.
 *
 * Hard rules (AND): must all pass for a match to exist.
 *   - model fuzzy match (brand + model)
 *   - year in [year_min, year_max]
 *   - km <= km_max
 *   - price <= price_max
 *   - region UF ∩ wishlist.region_uf non-empty (and city if specified)
 *   - fuel_type / transmission / armored: if set on wishlist, must match
 *   - seller_type must be 'PF' (we don't negotiate with dealerships)
 *   - wishlist.status must be 'active'
 *   - listing.status must be 'active'
 *
 * Soft score (0..1): bonus added beyond hard pass; used for priority ranking.
 *   - savings_pct vs FIPE
 *   - motivation signals (days_online, reductions, "aceita troca")
 *   - region exact city match
 *
 * Output: MatchResult[] for listings that cleared hard rules. Caller decides
 * whether to create opportunities (typically score >= threshold, default 0.7).
 */

import type { DbListing, DbWishlist } from "@/types/database";

export type MatchResult = {
  wishlist_id: string;
  listing_id: string;
  score: number; // 0..1
  reasons: string[]; // human-readable positive signals; useful for UI/debug
  hard_pass: boolean;
};

const DEFAULT_OPPORTUNITY_THRESHOLD = 0.7;

// ─── helpers ────────────────────────────────────────────────────────────────

const normalize = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

/** Bigram Sorensen-Dice similarity. Simple and good enough for model fuzziness. */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigrams = (s: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const pair = s.substring(i, i + 2);
      set.set(pair, (set.get(pair) ?? 0) + 1);
    }
    return set;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let shared = 0;
  for (const [k, count] of A) {
    const bCount = B.get(k);
    if (bCount) shared += Math.min(count, bCount);
  }
  const total =
    Array.from(A.values()).reduce((s, n) => s + n, 0) +
    Array.from(B.values()).reduce((s, n) => s + n, 0);
  return total === 0 ? 0 : (2 * shared) / total;
}

function modelMatches(listing: DbListing, wishlist: DbWishlist): boolean {
  if (!listing.brand || !listing.model) return false;
  const brandMatch = normalize(listing.brand) === normalize(wishlist.brand);
  if (!brandMatch) return false;
  const modelSim = similarity(normalize(listing.model), normalize(wishlist.model));
  return modelSim >= 0.85;
}

function yearInRange(listing: DbListing, wishlist: DbWishlist): boolean {
  if (listing.year == null) return false;
  if (wishlist.year_min != null && listing.year < wishlist.year_min) return false;
  if (wishlist.year_max != null && listing.year > wishlist.year_max) return false;
  return true;
}

function kmWithin(listing: DbListing, wishlist: DbWishlist): boolean {
  if (wishlist.km_max == null) return true;
  if (listing.km == null) return false;
  return listing.km <= wishlist.km_max;
}

function priceWithin(listing: DbListing, wishlist: DbWishlist): boolean {
  if (wishlist.price_max == null) return true;
  if (listing.price == null) return false;
  return listing.price <= wishlist.price_max;
}

function regionMatches(
  listing: DbListing,
  wishlist: DbWishlist,
): { pass: boolean; cityExact: boolean } {
  const wlUf = wishlist.region_uf ?? [];
  const wlCities = wishlist.region_cities ?? [];

  // Empty region means no constraint → pass but no city bonus
  if (wlUf.length === 0 && wlCities.length === 0) {
    return { pass: true, cityExact: false };
  }

  if (wlUf.length > 0) {
    if (!listing.seller_uf) return { pass: false, cityExact: false };
    if (!wlUf.map((uf) => uf.toUpperCase()).includes(listing.seller_uf.toUpperCase())) {
      return { pass: false, cityExact: false };
    }
  }

  let cityExact = false;
  if (wlCities.length > 0) {
    if (!listing.seller_city) return { pass: false, cityExact: false };
    const listingCity = normalize(listing.seller_city);
    const match = wlCities.some((c) => normalize(c) === listingCity);
    if (!match) return { pass: false, cityExact: false };
    cityExact = true;
  }

  return { pass: true, cityExact };
}

function fuelMatches(listing: DbListing, wishlist: DbWishlist): boolean {
  const wlFuels = wishlist.fuel_type ?? [];
  if (wlFuels.length === 0) return true;
  const attrs = listing.attributes as Record<string, unknown>;
  const listingFuel = typeof attrs?.fuel === "string" ? attrs.fuel : null;
  if (!listingFuel) return true; // missing data — don't hard-fail
  return wlFuels.map(normalize).includes(normalize(listingFuel));
}

function transmissionMatches(listing: DbListing, wishlist: DbWishlist): boolean {
  const wlTrans = wishlist.transmission ?? [];
  if (wlTrans.length === 0) return true;
  const attrs = listing.attributes as Record<string, unknown>;
  const listingTrans = typeof attrs?.transmission === "string" ? attrs.transmission : null;
  if (!listingTrans) return true;
  return wlTrans.map(normalize).includes(normalize(listingTrans));
}

function armoredMatches(listing: DbListing, wishlist: DbWishlist): boolean {
  if (wishlist.armored == null) return true;
  const attrs = listing.attributes as Record<string, unknown>;
  const listingArmored = Boolean(attrs?.armored);
  return listingArmored === wishlist.armored;
}

// ─── main entry point ───────────────────────────────────────────────────────

export type MatchingOptions = {
  threshold?: number; // minimum score to be considered opportunity-worthy
  enforcePfOnly?: boolean; // default true; skip PJ listings
};

export function matchListingToWishlists(
  listing: DbListing,
  wishlists: DbWishlist[],
  opts: MatchingOptions = {},
): MatchResult[] {
  const enforcePf = opts.enforcePfOnly ?? true;

  // Short-circuit gates that kill the listing for every wishlist
  if (listing.status !== "active") return [];
  if (enforcePf && listing.seller_type !== "PF") return [];

  const results: MatchResult[] = [];

  for (const wishlist of wishlists) {
    if (wishlist.status !== "active") continue;

    const reasons: string[] = [];

    if (!modelMatches(listing, wishlist)) continue;
    reasons.push(`modelo bate (${wishlist.brand} ${wishlist.model})`);

    if (!yearInRange(listing, wishlist)) continue;
    if (listing.year != null) reasons.push(`ano ${listing.year} na faixa`);

    if (!kmWithin(listing, wishlist)) continue;
    if (listing.km != null && wishlist.km_max != null) {
      reasons.push(
        `${listing.km.toLocaleString("pt-BR")} km (limite ${wishlist.km_max.toLocaleString("pt-BR")})`,
      );
    }

    if (!priceWithin(listing, wishlist)) continue;
    if (listing.price != null && wishlist.price_max != null) {
      reasons.push(
        `R$ ${listing.price.toLocaleString("pt-BR")} (limite R$ ${wishlist.price_max.toLocaleString("pt-BR")})`,
      );
    }

    const region = regionMatches(listing, wishlist);
    if (!region.pass) continue;
    if (listing.seller_city && listing.seller_uf) {
      reasons.push(`${listing.seller_city}/${listing.seller_uf}`);
    }

    if (!fuelMatches(listing, wishlist)) continue;
    if (!transmissionMatches(listing, wishlist)) continue;
    if (!armoredMatches(listing, wishlist)) continue;

    // ─── soft score ────────────────────────────────────────────────────────
    let score = 0.5; // baseline for a hard pass

    if (listing.savings_pct != null) {
      if (listing.savings_pct >= 30) {
        score += 0.35;
        reasons.push(`economia excepcional (${listing.savings_pct.toFixed(1)}% vs FIPE)`);
      } else if (listing.savings_pct >= 25) {
        score += 0.25;
        reasons.push(`economia forte (${listing.savings_pct.toFixed(1)}% vs FIPE)`);
      } else if (listing.savings_pct >= 20) {
        score += 0.15;
        reasons.push(`economia boa (${listing.savings_pct.toFixed(1)}% vs FIPE)`);
      } else if (listing.savings_pct >= 10) {
        score += 0.05;
      }
    }

    // motivation signals
    const signals = listing.motivation_signals as Record<string, unknown>;
    if (signals?.motivated === true) {
      score += 0.08;
      reasons.push("vendedor motivado");
    }
    if ((listing.reductions ?? 0) >= 1) {
      score += 0.04;
      reasons.push(`${listing.reductions} redução(ões) no preço`);
    }
    if ((listing.days_online ?? 0) >= 45) {
      score += 0.04;
      reasons.push(`${listing.days_online} dias no ar`);
    }
    const attrs = listing.attributes as Record<string, unknown>;
    if (attrs?.accept_trade === true) {
      score += 0.03;
      reasons.push("aceita troca");
    }

    if (region.cityExact) {
      score += 0.03;
      reasons.push("cidade exata");
    }

    // clamp and finalize
    score = Math.max(0, Math.min(1, score));

    results.push({
      wishlist_id: wishlist.id,
      listing_id: listing.id,
      score,
      reasons,
      hard_pass: true,
    });
  }

  return results;
}

/**
 * Convenience: matches that pass the opportunity threshold (default 0.7).
 * Use this when creating opportunities in the DB.
 */
export function opportunitiesWorthCreating(
  listing: DbListing,
  wishlists: DbWishlist[],
  opts: MatchingOptions = {},
): MatchResult[] {
  const threshold = opts.threshold ?? DEFAULT_OPPORTUNITY_THRESHOLD;
  return matchListingToWishlists(listing, wishlists, opts).filter((m) => m.score >= threshold);
}
