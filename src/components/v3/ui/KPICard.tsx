import { ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type KPICardColor = "brand" | "blue" | "green" | "amber" | "violet" | "slate";

export interface KPICardProps {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  trend?: ReactNode;
  color?: KPICardColor;
  /** When true, the value renders with the brand display serif and larger type. */
  emphasis?: boolean;
}

interface ColorTokens {
  iconBg: string;
  iconText: string;
  accentBar: string;
}

const COLOR_TOKENS: Record<KPICardColor, ColorTokens> = {
  brand: {
    iconBg: "bg-[#4C46DC]/10",
    iconText: "text-[#4C46DC]",
    accentBar: "bg-[#4C46DC]",
  },
  blue: {
    iconBg: "bg-blue-50",
    iconText: "text-blue-600",
    accentBar: "bg-blue-400",
  },
  green: {
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-600",
    accentBar: "bg-emerald-500",
  },
  amber: {
    iconBg: "bg-amber-50",
    iconText: "text-amber-600",
    accentBar: "bg-amber-500",
  },
  violet: {
    iconBg: "bg-violet-50",
    iconText: "text-violet-600",
    accentBar: "bg-violet-500",
  },
  slate: {
    iconBg: "bg-slate-100",
    iconText: "text-slate-500",
    accentBar: "bg-slate-400",
  },
};

export default function KPICard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  color = "blue",
  emphasis = false,
}: KPICardProps) {
  const tokens = COLOR_TOKENS[color];

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-5 transition-colors hover:border-slate-300">
      {/* Hairline accent bar on hover */}
      <span
        aria-hidden="true"
        className={`absolute left-0 top-0 h-full w-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${tokens.accentBar}`}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {label}
          </div>
          <div
            className={`mt-2 font-semibold tracking-tight text-slate-900 ${
              emphasis ? "text-4xl md:text-5xl leading-[1]" : "text-2xl leading-none"
            }`}
            style={emphasis ? { fontFamily: "var(--font-fraunces, Georgia, serif)" } : undefined}
          >
            {value}
          </div>
          {sub && <div className="mt-1.5 text-[11px] leading-tight text-slate-500">{sub}</div>}
        </div>
        {Icon && (
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tokens.iconBg} ${tokens.iconText}`}
          >
            <Icon size={18} strokeWidth={1.75} />
          </div>
        )}
      </div>

      {trend && (
        <div className="mt-3 flex items-center gap-1 font-mono text-[11px] font-semibold text-emerald-600">
          <ArrowUpRight size={13} strokeWidth={2} />
          {trend}
          <span className="font-medium text-slate-400">vs mês anterior</span>
        </div>
      )}
    </div>
  );
}
