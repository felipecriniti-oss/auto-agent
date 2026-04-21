"use client";

import Badge from "@/components/v3/ui/Badge";
import { type PlanKey, plansConfig } from "@/lib/mock-data/v3";
import { Check, Crown, Flame, Sparkles } from "lucide-react";
import { toast } from "sonner";

export interface PlanComparatorProps {
  currentPlan: PlanKey;
  onChangePlan: (plan: PlanKey) => void;
  layout?: "stacked" | "grid";
}

const planOrder: PlanKey[] = ["starter", "premium", "enterprise"];

const accentByKey: Record<PlanKey, { border: string; chip: string; button: string; icon: string }> =
  {
    starter: {
      border: "border-blue-500 bg-blue-50",
      chip: "bg-blue-50 text-blue-700 border-blue-200",
      button: "bg-blue-600 hover:bg-blue-700",
      icon: "text-blue-600",
    },
    premium: {
      border: "border-violet-500 bg-violet-50",
      chip: "bg-violet-50 text-violet-700 border-violet-200",
      button: "bg-violet-600 hover:bg-violet-700",
      icon: "text-violet-600",
    },
    enterprise: {
      border: "border-amber-500 bg-amber-50",
      chip: "bg-amber-50 text-amber-700 border-amber-200",
      button: "bg-amber-600 hover:bg-amber-700",
      icon: "text-amber-600",
    },
  };

function formatBreakEven(value: number): string {
  if (value === 0) return "Plano base";
  if (value < 1) return `${value.toFixed(2)} deals/mês`;
  return `${value} deals/mês`;
}

export default function PlanComparator({
  currentPlan,
  onChangePlan,
  layout = "grid",
}: PlanComparatorProps): React.JSX.Element {
  const containerClasses =
    layout === "grid"
      ? "bg-white rounded-xl border border-slate-200 p-5"
      : "bg-white rounded-xl border border-slate-200 p-6";

  return (
    <div className={containerClasses}>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={18} className="text-violet-600" />
        <h3 className="text-sm font-semibold text-slate-700">Comparar planos</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {planOrder.map((key) => {
          const plan = plansConfig[key];
          const accent = accentByKey[key];
          const isCurrent = key === currentPlan;
          return (
            <div
              key={key}
              className={`relative rounded-xl border-2 p-4 transition-colors ${
                isCurrent ? accent.border : "border-slate-200 hover:border-slate-300"
              }`}
            >
              {plan.hot && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-violet-600 text-white text-[10px] font-bold px-2.5 py-0.5 uppercase tracking-wide">
                  <Flame size={10} /> Mais escolhido
                </span>
              )}
              <div className="flex items-center gap-1.5 mb-1">
                <Crown size={14} className={accent.icon} />
                <p className="text-sm font-bold text-slate-900">{plan.name}</p>
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {plan.price === 0 ? (
                  <>
                    Grátis<span className="text-xs font-normal text-slate-500">/mês</span>
                  </>
                ) : (
                  <>
                    R$ {plan.price.toLocaleString("pt-BR")}
                    <span className="text-xs font-normal text-slate-500">/mês</span>
                  </>
                )}
              </p>
              <p className="text-xs text-blue-700 font-medium mt-0.5">
                + fee {plan.feeLabel} sobre economia
              </p>
              <ul className="mt-3 space-y-1.5">
                {plan.features.slice(0, 4).map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-slate-600">
                    <Check size={12} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-[11px] text-slate-500">
                  Break-even ·{" "}
                  <span className="font-semibold text-slate-700">
                    {formatBreakEven(plan.breakEvenVsStarter)}
                  </span>
                </p>
              </div>
              <div className="mt-3">
                {isCurrent ? (
                  <Badge variant="primary" size="sm" className="w-full justify-center">
                    Plano atual
                  </Badge>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onChangePlan(key);
                      toast.success(`Plano alterado para ${plan.name}`, {
                        description: `Você agora está no ${plan.name}.`,
                      });
                    }}
                    className={`w-full py-1.5 text-white rounded-lg text-xs font-semibold ${accent.button}`}
                  >
                    Mudar para {plan.name}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
