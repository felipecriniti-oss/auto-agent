"use client";

import KPICard from "@/components/v3/ui/KPICard";
import type { DashKPIs } from "@/lib/mock-data/v3";
import { DollarSign, FileCheck, Receipt, ShoppingCart, TrendingUp } from "lucide-react";

export interface DashboardKPIRowProps {
  kpis: DashKPIs;
}

export default function DashboardKPIRow({ kpis }: DashboardKPIRowProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Hero KPI — dominant, display serif, echoes the landing "47s" clock */}
      <div className="rounded-2xl border border-[#4C46DC]/15 bg-gradient-to-br from-[#4C46DC]/[0.05] via-white to-white p-6 lg:row-span-2">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4C46DC]">
          Economia capturada · Abril 2026
        </div>
        <div
          className="mt-3 text-5xl font-semibold leading-none tracking-tight text-slate-900 md:text-6xl"
          style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
        >
          R${" "}
          <span className="italic text-[#4C46DC]">
            {(kpis.economiaCapturadaMes / 1000).toFixed(0)}k
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Margem que o agente trouxe pro seu pátio neste mês, capturada abaixo da FIPE em deals
          pré-negociados.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[#4C46DC]/10 pt-4">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              vs tabela FIPE
            </div>
            <div
              className="mt-1 text-lg font-semibold leading-none text-emerald-600"
              style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
            >
              −{kpis.desconto_medio_fipe}%
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              ROI do mês
            </div>
            <div
              className="mt-1 text-lg font-semibold leading-none text-slate-900"
              style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
            >
              {kpis.roiMes}x
            </div>
          </div>
        </div>
      </div>

      {/* Secondary KPIs — 4-tile stack beside the hero on desktop */}
      <div className="grid grid-cols-2 gap-4 lg:col-span-2">
        <KPICard
          icon={ShoppingCart}
          label="Marketplace"
          value={kpis.marketplaceAtivo}
          sub="oportunidades aguardando"
          trend="+12"
          color="brand"
        />
        <KPICard
          icon={FileCheck}
          label="Meus Deals"
          value={kpis.meusDeals}
          sub="deals ativos"
          color="violet"
        />
        <KPICard
          icon={Receipt}
          label="Fees pagos"
          value={`R$ ${kpis.feesPagosMes.toLocaleString("pt-BR")}`}
          sub="sobre economia"
          color="amber"
        />
        <KPICard
          icon={DollarSign}
          label="Tempo médio"
          value={`${kpis.tempo_medio_deal_segundos}s`}
          sub="da abordagem ao aceite"
          color="green"
        />
      </div>

      {/* Trend strip — echoes landing proof points, mobile-only third cell */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 lg:col-span-3">
        <div className="flex items-center gap-6 overflow-x-auto">
          <TrendCell value={kpis.deals_mes.toLocaleString("pt-BR")} label="deals/mês (M12)" />
          <TrendCell value={`${kpis.lojistas_ativos}+`} label="lojistas ativos" />
          <TrendCell value={kpis.nps_lojista.toString()} label="NPS" accent="emerald" />
          <TrendCell value={`${kpis.take_rate_blended}%`} label="take rate blended" />
          <TrendCell value={`R$ ${kpis.cac_lojista}`} label="CAC · lojista qualificado" />
        </div>
        <TrendingUp size={18} className="shrink-0 text-slate-300" />
      </div>
    </div>
  );
}

interface TrendCellProps {
  value: string;
  label: string;
  accent?: "emerald" | "violet";
}

function TrendCell({ value, label, accent }: TrendCellProps): React.JSX.Element {
  const valueClass =
    accent === "emerald"
      ? "text-emerald-600"
      : accent === "violet"
        ? "text-[#4C46DC]"
        : "text-slate-900";
  return (
    <div className="shrink-0">
      <div
        className={`text-lg font-semibold leading-none ${valueClass}`}
        style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
      >
        {value}
      </div>
      <div className="mt-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>
    </div>
  );
}
