"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { matchListingToWishlists } from "@/lib/matching/engine";
import type { WishlistFormValues } from "@/lib/schemas/wishlist";
import { useListingsSnapshot } from "@/lib/supabase/hooks/useListingsSnapshot";
import { formValuesToPendingWishlist } from "@/lib/wishlist/formValuesToPendingWishlist";
import type { DbListing } from "@/types/database";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type Control, useWatch } from "react-hook-form";

// W6: UI-SPEC Copy row 'Preview pane loading' specifies "Calculando matches..." but
// State Matrix §Preview pane explicitly permits Skeleton. Choosing Skeleton for
// consistency with the RHF debounce feedback and to avoid a text flash while the
// 400ms debounce settles. Documented as a deliberate W6 deviation from the copy table.

type Props = {
  control: Control<WishlistFormValues>;
};

/**
 * Live preview pane — debounced count of matching listings per current form values.
 *
 * Architecture (RESEARCH.md §Pattern 3 + §Pitfall 1):
 *   1. useWatch on RHF control → rerenders on any field change
 *   2. setTimeout 400ms → setDebounced(values)
 *   3. useMemo [debounced, snapshot] → formValuesToPendingWishlist → per-listing engine call
 *   4. Count listings where matchListingToWishlists returns non-empty results
 *
 * Landmines:
 *   - L1: engine signature is matchListingToWishlists(listing, wishlists[]) — the inverse loop
 *     is mandatory. Per-listing call with a single-wishlist array, count non-empty results.
 *   - Adapter MUST set status="active" — engine short-circuits non-active listings/wishlists.
 */
export function WishlistPreviewPane({ control }: Props): React.JSX.Element {
  const values = useWatch({ control });
  const [debounced, setDebounced] = useState<Partial<WishlistFormValues>>(
    values as Partial<WishlistFormValues>,
  );
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(values as Partial<WishlistFormValues>), 400);
    return () => clearTimeout(t);
  }, [values]);

  const { data: snapshot = [] } = useListingsSnapshot();

  const { count, samples } = useMemo<{
    count: number | null;
    samples: DbListing[];
  }>(() => {
    const pending = formValuesToPendingWishlist(debounced);
    if (!pending.brand || !pending.model) {
      return { count: null, samples: [] };
    }
    try {
      let c = 0;
      const matched: DbListing[] = [];
      for (const listing of snapshot) {
        const results = matchListingToWishlists(listing, [pending]);
        if (results.length > 0) {
          c += 1;
          if (matched.length < 3) matched.push(listing);
        }
      }
      return { count: c, samples: matched };
    } catch {
      // State Matrix row "Preview pane" → Error state: "Silent no-op if matchingEngine throws"
      return { count: null, samples: [] };
    }
  }, [debounced, snapshot]);

  return (
    <section
      aria-live="polite"
      className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40"
    >
      <h3 className="font-semibold text-slate-900 text-sm dark:text-slate-100">
        Prévia de resultados
      </h3>
      {count === null ? (
        // W6: Skeleton selected over "Calculando matches..." text per State Matrix §Preview pane allowance
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : count === 0 ? (
        <p className="text-slate-600 text-sm dark:text-slate-400">
          Ainda não achamos anúncios compatíveis. Você pode salvar a wishlist mesmo assim — novos
          anúncios aparecem todo dia.
        </p>
      ) : (
        <>
          <p className="text-slate-700 text-sm dark:text-slate-200">
            Com essas regras, acharíamos{" "}
            <span className="font-semibold text-[#4C46DC]">{count} anúncios</span> esta semana.
          </p>
          {samples.length > 0 && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((e) => !e)}
                className="text-xs"
              >
                Ver exemplos
                <ChevronDown
                  className={`ml-1 size-3 transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </Button>
              {expanded && (
                <ul className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  {samples.map((l) => (
                    <li
                      key={l.id}
                      className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
                    >
                      <div className="aspect-square w-full bg-slate-100 dark:bg-slate-800">
                        {/* MED-04: TODO(Phase 8) — swap to next/image once listing photo URLs come from
                            scraping (WebMotors/OLX/Mercado Livre). At that point, configure
                            next.config.ts `images.remotePatterns` with the real CDN hosts so we
                            get build-time domain whitelisting + Vercel image optimization.
                            Curated mock URLs in Phase 7 make raw <img> acceptable for now. */}
                        {l.photo_url ? (
                          // Phase 7 mocks only — see MED-04 TODO above. Will swap to next/image
                          // in Phase 8 once listing photo URLs come from real CDN hosts.
                          <img src={l.photo_url} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="space-y-1 p-2 text-xs">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {l.brand} {l.model}
                        </p>
                        <p className="text-slate-600 dark:text-slate-400">
                          {l.price != null
                            ? `R$ ${l.price.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                            : "—"}
                          {" · "}
                          {l.km != null ? `${l.km.toLocaleString("pt-BR")} km` : "—"}
                        </p>
                        <p className="text-slate-500 dark:text-slate-500">
                          {l.year ?? ""} · {l.seller_uf ?? ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
