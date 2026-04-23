"use client";

import DashboardKPIRow from "@/components/v3/modules/dashboard/DashboardKPIRow";
import DealsChart from "@/components/v3/modules/dashboard/DealsChart";
import PilotLauncher from "@/components/v3/modules/dashboard/PilotLauncher";
import PlanComparator from "@/components/v3/modules/dashboard/PlanComparator";
import RecentActivity from "@/components/v3/modules/dashboard/RecentActivity";
import { dashKPIs, monthlyDeals } from "@/lib/mock-data/v3";
import { useAppStore } from "@/lib/stores/app";
import { useProfile } from "@/lib/supabase/hooks/useProfile";

export default function DashboardModule(): React.JSX.Element {
  const currentPlan = useAppStore((s) => s.currentPlan);
  const setCurrentPlan = useAppStore((s) => s.setCurrentPlan);
  const { data: profile } = useProfile();
  const profileName = profile?.name ?? null;

  const greetingName = profileName?.split(" ")[0] ?? "lojista";

  return (
    <div className="space-y-6 p-6 md:p-8">
      {/* Editorial header */}
      <header className="border-b border-slate-200/70 pb-6">
        <div className="mb-3 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[#4C46DC]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4C46DC]" />
          Dashboard · operação · Abril 2026
        </div>
        <h1
          className="text-3xl font-semibold leading-[1.05] tracking-tight text-slate-900 md:text-4xl"
          style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
        >
          Olá, <em className="italic text-[#4C46DC]">{greetingName}</em>. Bem-vindo ao painel.
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-slate-600">
          Acompanhe o que o agente está capturando hoje e quanto margem está entrando no seu pátio.
          Rode o modo piloto quando quiser ver o agente varrendo os marketplaces em tempo real.
        </p>
      </header>

      {/* Pilot launcher — signature demo CTA */}
      <PilotLauncher />

      {/* KPI row */}
      <DashboardKPIRow kpis={dashKPIs} />

      {/* Chart + activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DealsChart data={monthlyDeals} />
        </div>
        <RecentActivity />
      </div>

      {/* Plan comparator */}
      <PlanComparator currentPlan={currentPlan} onChangePlan={setCurrentPlan} />
    </div>
  );
}
