"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

type Props = {
  value: number | null;
  onChange: (next: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
};

/**
 * Controlled km input with pt-BR thousand separator.
 * - Stores integer km per D-06.
 * - Displays as `80.000` (no prefix). "km" suffix rendered inline.
 * - Emits null when cleared.
 */
export function KmInput({
  value,
  onChange,
  placeholder = "0",
  disabled,
  id,
  className,
}: Props): React.JSX.Element {
  const display = useMemo(() => {
    if (value == null) return "";
    return value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const digits = e.target.value.replace(/\D/g, "");
    if (digits.length === 0) {
      onChange(null);
      return;
    }
    onChange(Number.parseInt(digits, 10));
  }

  return (
    <div className="relative">
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className={cn("h-11 bg-white pr-10 dark:bg-slate-950", className)}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500 text-xs dark:text-slate-400">
        km
      </span>
    </div>
  );
}
