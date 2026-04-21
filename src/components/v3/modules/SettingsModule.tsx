"use client";

import PlanComparator from "@/components/v3/modules/dashboard/PlanComparator";
import Badge from "@/components/v3/ui/Badge";
import { type PlanKey, plansConfig } from "@/lib/mock-data/v3";
import { resetAppForTests, useAppStore } from "@/lib/stores/app";
import {
  AlertTriangle,
  Calculator,
  Check,
  Crown,
  Settings as SettingsIcon,
  TrendingDown,
  UserCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const planKeys: PlanKey[] = ["starter", "premium", "enterprise"];

interface PlanCost {
  plan: PlanKey;
  monthly: number;
  fees: number;
  total: number;
}

function computePlanCost(deals: number, avgSavings: number, plan: PlanKey): PlanCost {
  const cfg = plansConfig[plan];
  const fees = Math.max(0, deals) * Math.max(0, avgSavings) * cfg.feeRate;
  return {
    plan,
    monthly: cfg.price,
    fees,
    total: cfg.price + fees,
  };
}

export default function SettingsModule(): React.JSX.Element {
  const currentPlan = useAppStore((s) => s.currentPlan);
  const setCurrentPlan = useAppStore((s) => s.setCurrentPlan);
  const plan = plansConfig[currentPlan];

  const [deals, setDeals] = useState<number>(0.5);
  const [avgSavings, setAvgSavings] = useState<number>(30000);

  const scenarios = useMemo<PlanCost[]>(
    () => planKeys.map((k) => computePlanCost(deals, avgSavings, k)),
    [deals, avgSavings],
  );

  const cheapest = useMemo<PlanKey>(() => {
    return scenarios.reduce<PlanCost>(
      (best, curr) => (curr.total < best.total ? curr : best),
      scenarios[0],
    ).plan;
  }, [scenarios]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <SettingsIcon size={22} className="text-blue-600" />
          Configurações
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Plano, break-even, conta e ferramentas de demo
        </p>
      </div>

      {/* Section 1: Seu plano */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-4">Seu plano</h3>
        <div className="bg-blue-50 rounded-xl p-5 border border-blue-100 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Crown size={16} className="text-blue-600" />
              <span className="font-semibold text-blue-700">{plan.name}</span>
              {plan.hot && (
                <Badge variant="accent" size="xs">
                  Mais escolhido
                </Badge>
              )}
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {plan.price === 0 ? (
                "Grátis"
              ) : (
                <>
                  R$ {plan.price.toLocaleString("pt-BR")}
                  <span className="text-sm font-normal text-slate-500">/mês</span>
                </>
              )}
            </p>
            <p className="text-sm text-blue-600 mt-1">
              + fee {plan.feeLabel} sobre cada economia capturada
            </p>
            <ul className="mt-3 space-y-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-1.5 text-xs text-slate-700">
                  <Check size={12} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <Badge variant="primary" size="sm">
            Plano atual
          </Badge>
        </div>
      </section>

      {/* Section 2: Break-even simulator */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calculator size={18} className="text-emerald-600" />
          <h3 className="text-base font-semibold text-slate-900">Simulador de break-even</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Ajuste seus inputs e veja o custo mensal estimado em cada plano.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600 mb-1 block">
              Deals previstos por mês
            </span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={deals}
              onChange={(e) => setDeals(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600 mb-1 block">
              Economia média por deal (R$)
            </span>
            <input
              type="number"
              min={0}
              step={1000}
              value={avgSavings}
              onChange={(e) => setAvgSavings(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {scenarios.map((s) => {
            const cfg = plansConfig[s.plan];
            const isCheapest = s.plan === cheapest;
            return (
              <div
                key={s.plan}
                className={`rounded-xl border-2 p-4 ${
                  isCheapest ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-slate-900">{cfg.name}</p>
                  {isCheapest && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 uppercase tracking-wide">
                      <TrendingDown size={10} /> Mais barato
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">No {cfg.name} você pagaria</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  R$ {Math.round(s.total).toLocaleString("pt-BR")}
                  <span className="text-xs font-normal text-slate-500">/mês</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Assinatura R$ {s.monthly.toLocaleString("pt-BR")} + fees R${" "}
                  {Math.round(s.fees).toLocaleString("pt-BR")}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 3: Comparar planos */}
      <PlanComparator currentPlan={currentPlan} onChangePlan={setCurrentPlan} layout="stacked" />

      {/* Section 4: Conta */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <UserCircle size={18} className="text-slate-500" />
          <h3 className="text-base font-semibold text-slate-900">Conta</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">Campos estáticos neste protótipo (demo).</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AccountField label="Nome" value="Auto Premium SP" />
          <AccountField label="CNPJ" value="12.345.678/0001-90" />
          <AccountField label="Email" value="contato@autopremium.com.br" />
          <AccountField label="WhatsApp" value="(11) 98765-4321" />
        </div>
      </section>

      {/* Section 5: Danger zone */}
      <section className="bg-white rounded-xl border-2 border-red-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={18} className="text-red-600" />
          <h3 className="text-base font-semibold text-red-700">Danger zone</h3>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Reseta o estado local do app (oportunidades, deals, plano). Útil para demos e testes — não
          afeta dados reais.
        </p>
        <button
          type="button"
          onClick={() => {
            resetAppForTests();
            toast.success("App resetado", {
              description: "Estado local restaurado aos valores iniciais.",
            });
          }}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold"
        >
          Resetar app (zerar opportunities/deals/plan)
        </button>
      </section>
    </div>
  );
}

interface AccountFieldProps {
  label: string;
  value: string;
}

function AccountField({ label, value }: AccountFieldProps): React.JSX.Element {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600 mb-1 block">
        {label} <span className="font-normal text-slate-400">(demo)</span>
      </span>
      <input
        type="text"
        value={value}
        disabled
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600 cursor-not-allowed"
      />
    </label>
  );
}
