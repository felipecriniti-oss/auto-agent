"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * Compact 3-state toggle for light/dark/system. Rendered in the Sidebar.
 * Deliberately small — a single button cycling through the 3 modes keeps
 * the footprint minimal while still exposing "follow system" as an option.
 */
export default function ThemeToggle(): React.JSX.Element | null {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes hydration dance — avoid rendering with a server-side theme
  // guess that mismatches the client's stored preference.
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Reserve space so the sidebar doesn't jump on hydration.
    return (
      <div
        aria-hidden="true"
        className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700"
      />
    );
  }

  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const label =
    theme === "system"
      ? `Sistema (${resolvedTheme === "dark" ? "escuro" : "claro"})`
      : theme === "dark"
        ? "Escuro"
        : "Claro";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-[#4C46DC]/40 hover:text-[#4C46DC] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-[#7063E0] dark:hover:text-[#a8a1ff]"
      aria-label={`Tema atual: ${label}. Clique para alternar.`}
    >
      <span className="flex items-center gap-2">
        {theme === "system" ? (
          <Monitor size={14} />
        ) : theme === "dark" ? (
          <Moon size={14} />
        ) : (
          <Sun size={14} />
        )}
        <span className="truncate">{label}</span>
      </span>
      <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Tema
      </span>
    </button>
  );
}
