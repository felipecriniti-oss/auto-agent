"use client";

import KPICard from "@/components/v3/ui/KPICard";
import type { DashKPIs } from "@/lib/mock-data/v3";
import { DollarSign, FileCheck, Receipt, ShoppingCart, TrendingUp } from "lucide-react";

export interface DashboardKPIRowProps {
  kpis: DashKPIs;
}

export default function DashboardKPIRow({ kpis }: DashboardKPIRowProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <KPICard
        icon={ShoppingCart}
        label="Oportunidades no Marketplace"
        value={kpis.marketplaceAtivo}
        sub="aguardando você"
        trend="+12"
        color="blue"
      />
      <KPICard
        icon={FileCheck}
        label="Meus Deals"
        value={kpis.meusDeals}
        sub="ativos"
        color="violet"
      />
      <KPICard
        icon={DollarSign}
        label="Economia Capturada no Mês"
        value={`R$ ${(kpis.economiaCapturadaMes / 1000).toFixed(0)}k`}
        sub="vs tabela FIPE"
        trend="+18%"
        color="green"
      />
      <KPICard
        icon={Receipt}
        label="Fees Pagos Mês"
        value={`R$ ${kpis.feesPagosMes.toLocaleString("pt-BR")}`}
        sub="sobre economia capturada"
        color="amber"
      />
      <KPICard
        icon={TrendingUp}
        label="ROI do mês"
        value={`${kpis.roiMes}x`}
        sub="a cada R$ 1 investido"
        color="green"
      />
    </div>
  );
}
