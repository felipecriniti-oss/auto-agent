import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  threshold?: number; // px tolerance for "at bottom"
}

/**
 * Pin-on-scroll-up autoscroll per D-06.
 * - Auto-scrolls when `deps` change, ONLY if user is at the bottom.
 * - User scrolls up → isAtBottom=false → auto-scroll disengages.
 * - Returns `scrollToBottom` for the "↓ Nova mensagem" button.
 */
export function useAutoscroll<T extends HTMLElement>(deps: unknown[], opts: Options = {}) {
  const threshold = opts.threshold ?? 64;
  const ref = useRef<T | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const scrollToBottom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setIsAtBottom(true);
  }, []);

  // Track user scroll position.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setIsAtBottom(dist <= threshold);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [threshold]);

  // Auto-scroll on dep change only when already at bottom.
  // biome-ignore lint/correctness/useExhaustiveDependencies: caller-provided deps array is intentional
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isAtBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, deps);

  return { ref, isAtBottom, scrollToBottom };
}
