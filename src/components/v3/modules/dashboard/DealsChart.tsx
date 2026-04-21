"use client";

import type { MonthlyDealPoint } from "@/lib/mock-data/v3";
import { TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

export interface DealsChartProps {
  data: MonthlyDealPoint[];
}

interface DealTooltipPayload {
  month: string;
  deals: number;
}

function DealsTooltip({ active, payload }: TooltipContentProps): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  const first = payload[0];
  const point = first?.payload as DealTooltipPayload | undefined;
  if (!point) return null;
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm px-3 py-2 text-xs">
      <p className="font-semibold text-slate-900">{point.month}</p>
      <p className="text-slate-600 mt-0.5">
        <span className="font-semibold text-blue-700">{point.deals}</span>{" "}
        {point.deals === 1 ? "deal" : "deals"} fechados
      </p>
    </div>
  );
}

export default function DealsChart({ data }: DealsChartProps): React.JSX.Element {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={18} className="text-blue-600" />
        <h3 className="text-sm font-semibold text-slate-700">Deals fechados por mês</h3>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="dealsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748B" }} />
          <YAxis tick={{ fontSize: 11, fill: "#64748B" }} allowDecimals={false} />
          <Tooltip content={(props) => <DealsTooltip {...props} />} />
          <Area
            type="monotone"
            dataKey="deals"
            stroke="#2563EB"
            strokeWidth={2}
            fill="url(#dealsGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
