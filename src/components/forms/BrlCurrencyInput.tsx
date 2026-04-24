"use client";

import { Input } from "@/components/ui/input";
import type { Reais } from "@/lib/schemas/wishlist";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

type Props = {
  value: Reais | null;
  onChange: (next: Reais | null) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
};

/**
 * Controlled BRL currency input.
 * - Stores integer reais (no cents) per D-06.
 * - Displays as `R$ 130.000` with pt-BR thousand separator.
 * - Emits null when cleared.
 *
 * Stripping rule (W12): all non-digit characters are removed before parsing.
 *   'R$ 130.000' → '130000' → 130000 (integer reais).
 *   'abc130.000,50' → '13000050' (conceptually wrong BUT benign: Zod rejects
 *   price > 5,000,000 at submit time, so this input cannot pass validation).
 * The component never attempts to interpret commas or periods as decimal
 * separators — D-06 locks integer reais with no cents.
 */
export function BrlCurrencyInput({
  value,
  onChange,
  placeholder = "R$ 0",
  disabled,
  id,
  className,
}: Props): React.JSX.Element {
  const display = useMemo(() => {
    if (value == null) return "";
    return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      className={cn("h-11 bg-white dark:bg-slate-950", className)}
    />
  );
}
