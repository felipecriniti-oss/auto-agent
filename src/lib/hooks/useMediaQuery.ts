"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe media query hook.
 *
 * Usage:
 *   const isDesktop = useMediaQuery("(min-width: 768px)");
 *
 * - Returns `false` during SSR / initial render (no `window`).
 * - Subscribes to `MediaQueryList` change events on mount and cleans up on unmount.
 * - Reads the synchronous match value once on mount, then tracks updates.
 *
 * Used by `WishlistFormSheet` to gate the desktop aside vs. the mobile Dialog
 * rendering (HIGH-01 fix): Radix `DialogContent` portals to `document.body` and
 * escapes any `md:hidden` wrapper, so the only reliable way to render exactly
 * one branch per viewport is to JSX-gate the entire subtree at runtime.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(query);
    // Initialize synchronously on mount in case the SSR default (false) doesn't match.
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    // Modern browsers: addEventListener('change'). Older Safari: addListener.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // Fallback for legacy implementations
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);

  return matches;
}
