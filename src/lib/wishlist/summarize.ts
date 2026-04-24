/**
 * summarize — auto-generates wishlist name per D-08:
 *   `{brand} {model} {year_min}+ {region_uf[0] ?? ""}`.trim()
 *
 * Examples:
 *   summarize({brand:"Honda", model:"Civic", year_min:2018, region_uf:["SP"]})
 *     → "Honda Civic 2018+ SP"
 *   summarize({brand:"Honda", model:"Civic", year_min:2018, region_uf:[]})
 *     → "Honda Civic 2018+"
 *   summarize({brand:"Honda", model:"Civic", year_min:null, region_uf:["SP"]})
 *     → "Honda Civic SP"
 *   summarize({brand:"", model:"", ...}) → "Wishlist sem nome"
 *
 * Accepts both WishlistFormValues (from the form, no id/status) and DbWishlist
 * (from the server row) — the minimal structural type captured below makes the
 * helper tolerant at call-sites without runtime cost (W9 — summarize type tolerance).
 */
export type SummarizableWishlist = {
  brand?: string | null;
  model?: string | null;
  year_min?: number | null;
  region_uf?: string[] | null;
};

export function summarize(w: SummarizableWishlist): string {
  const brand = (w.brand ?? "").trim();
  const model = (w.model ?? "").trim();
  if (!brand && !model) return "Wishlist sem nome";
  const parts: string[] = [];
  if (brand) parts.push(brand);
  if (model) parts.push(model);
  if (w.year_min != null) parts.push(`${w.year_min}+`);
  if (w.region_uf && w.region_uf.length > 0) parts.push(w.region_uf[0]);
  return parts.join(" ").trim();
}
