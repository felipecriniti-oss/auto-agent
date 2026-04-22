/**
 * Computes per-opportunity negotiation parameters: target price and hard floor.
 *
 * target_price = fipe * (1 - target_discount)     — ideal close
 * hard_floor   = fipe * (1 - max_discount)        — NEVER offer below this
 *
 * Both are clamped to [0, listing.price] so we don't compute absurd floors
 * against pre-reduced listings.
 */

import type { DbListing } from "@/types/database";

const DEFAULT_TARGET_DISCOUNT = 0.25; // 25% below FIPE
const DEFAULT_MAX_DISCOUNT = 0.3; // 30% below FIPE

export type NegotiationParams = {
  target_price: number;
  hard_floor: number;
  fipe: number;
};

export function computeNegotiationParams(
  listing: DbListing,
  opts: { target_discount?: number; max_discount?: number } = {},
): NegotiationParams {
  const fipe = listing.fipe ?? listing.price ?? 0;
  if (fipe <= 0) {
    // No FIPE + no price = no floor basis. Caller should treat this as
    // "don't negotiate autonomously" — escalate to human.
    return { target_price: 0, hard_floor: 0, fipe: 0 };
  }

  const targetDiscount = opts.target_discount ?? DEFAULT_TARGET_DISCOUNT;
  const maxDiscount = opts.max_discount ?? DEFAULT_MAX_DISCOUNT;

  const rawTarget = fipe * (1 - targetDiscount);
  const rawFloor = fipe * (1 - maxDiscount);

  // Clamp to not exceed asking price (no point "targeting" above what's listed)
  const askingPrice = listing.price ?? Number.POSITIVE_INFINITY;
  const target_price = Math.round(Math.min(rawTarget, askingPrice));
  const hard_floor = Math.round(Math.min(rawFloor, askingPrice));

  return { target_price, hard_floor, fipe };
}
