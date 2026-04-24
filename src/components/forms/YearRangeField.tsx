"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  valueMin: number | null;
  valueMax: number | null;
  onChangeMin: (next: number | null) => void;
  onChangeMax: (next: number | null) => void;
  disabled?: boolean;
  idMin?: string;
  idMax?: string;
  labelText?: string;
  hintText?: string;
  errorText?: string;
  className?: string;
};

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Dual number-input for year range (year_min + year_max).
 * - pt-BR friendly: type="number" + inputMode="numeric"
 * - Empty string → null, any numeric → Number()
 * - Shared label "Ano" above grid
 * - Error rendering handled by parent FormField via schema .refine path ["year_min"]
 */
export function YearRangeField({
  valueMin,
  valueMax,
  onChangeMin,
  onChangeMax,
  disabled,
  idMin = "year-min",
  idMax = "year-max",
  labelText = "Ano",
  hintText = "Deixe vazio para qualquer ano",
  errorText,
  className,
}: Props): React.JSX.Element {
  function handle(change: (v: number | null) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      change(raw === "" ? null : Number(raw));
    };
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{labelText}</Label>
      <div className="grid grid-cols-2 gap-3">
        <Input
          id={idMin}
          type="number"
          inputMode="numeric"
          min={1990}
          max={CURRENT_YEAR + 1}
          placeholder="1990+"
          value={valueMin ?? ""}
          onChange={handle(onChangeMin)}
          disabled={disabled}
          className="h-11 bg-white dark:bg-slate-950"
        />
        <Input
          id={idMax}
          type="number"
          inputMode="numeric"
          min={1990}
          max={CURRENT_YEAR + 1}
          placeholder={String(CURRENT_YEAR)}
          value={valueMax ?? ""}
          onChange={handle(onChangeMax)}
          disabled={disabled}
          className="h-11 bg-white dark:bg-slate-950"
        />
      </div>
      {errorText ? (
        <p className="text-red-600 text-xs dark:text-red-400">{errorText}</p>
      ) : (
        <p className="text-slate-500 text-xs dark:text-slate-400">{hintText}</p>
      )}
    </div>
  );
}
