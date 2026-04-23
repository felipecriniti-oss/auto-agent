"use client";

import { estimatePasswordStrength } from "@/lib/auth/password-strength";
import { useMemo } from "react";

interface PasswordStrengthMeterProps {
  password: string;
  userInputs?: string[];
}

const BAR_COLORS = [
  "bg-red-500", // 0
  "bg-red-400", // 1
  "bg-amber-500", // 2
  "bg-emerald-500", // 3
  "bg-emerald-600", // 4
];

const TEXT_COLORS = [
  "text-red-600 dark:text-red-400",
  "text-red-600 dark:text-red-400",
  "text-amber-700 dark:text-amber-400",
  "text-emerald-700 dark:text-emerald-400",
  "text-emerald-700 dark:text-emerald-400",
];

export function PasswordStrengthMeter({ password, userInputs }: PasswordStrengthMeterProps) {
  const strength = useMemo(
    () => estimatePasswordStrength(password, userInputs),
    [password, userInputs],
  );

  if (!password) return null;

  const filledBars = strength.score + 1; // 0 → 1 bar filled, 4 → 5 bars filled
  const primaryMessage = strength.warning ?? strength.suggestions[0] ?? null;
  const bars = ["a", "b", "c", "d", "e"] as const;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {bars.map((barKey, idx) => {
          const filled = idx < filledBars;
          return (
            <div
              key={barKey}
              className={`h-1 flex-1 rounded-full transition-colors ${
                filled ? BAR_COLORS[strength.score] : "bg-slate-200 dark:bg-slate-800"
              }`}
            />
          );
        })}
      </div>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-[11px] font-semibold ${TEXT_COLORS[strength.score]}`}>
          {strength.label}
        </p>
        {primaryMessage ? (
          <p className="text-right text-[11px] text-slate-500 dark:text-slate-400">
            {primaryMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
