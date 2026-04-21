"use client";

import DashboardKPIRow from "@/components/v3/modules/dashboard/DashboardKPIRow";
import DealsChart from "@/components/v3/modules/dashboard/DealsChart";
import PlanComparator from "@/components/v3/modules/dashboard/PlanComparator";
import RecentActivity from "@/components/v3/modules/dashboard/RecentActivity";
import { dashKPIs, monthlyDeals } from "@/lib/mock-data/v3";
import { useAppStore } from "@/lib/stores/app";

export default function DashboardModule(): React.JSX.Element {
  const currentPlan = useAppStore((s) => s.currentPlan);
  const setCurrentPlan = useAppStore((s) => s.setCurrentPlan);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
        <p className="text-sm text-slate-500 mt-1">Visão geral · Abril 2026</p>
      </div>

      <DashboardKPIRow kpis={dashKPIs} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DealsChart data={monthlyDeals} />
        </div>
        <RecentActivity />
      </div>

      <PlanComparator currentPlan={currentPlan} onChangePlan={setCurrentPlan} />
    </div>
  );
}
