"use client";

import { CheckCircle, Clock, FileSignature, ShoppingCart } from "lucide-react";
import type { ComponentType } from "react";

interface ActivityItem {
  id: number;
  Icon: ComponentType<{ size?: number; className?: string }>;
  iconClass: string;
  title: string;
  timestamp: string;
}

const activity: ActivityItem[] = [
  {
    id: 1,
    Icon: ShoppingCart,
    iconClass: "text-blue-600 bg-blue-50",
    title: "BMW X3 adicionado ao Marketplace",
    timestamp: "há 2h",
  },
  {
    id: 2,
    Icon: FileSignature,
    iconClass: "text-violet-600 bg-violet-50",
    title: "Deal Jeep Compass assumido",
    timestamp: "há 3d",
  },
  {
    id: 3,
    Icon: CheckCircle,
    iconClass: "text-emerald-600 bg-emerald-50",
    title: "Oportunidade fechada 20% abaixo da FIPE",
    timestamp: "há 4d",
  },
  {
    id: 4,
    Icon: ShoppingCart,
    iconClass: "text-blue-600 bg-blue-50",
    title: "Mercedes GLC 300 adicionado ao Marketplace",
    timestamp: "há 5d",
  },
  {
    id: 5,
    Icon: CheckCircle,
    iconClass: "text-emerald-600 bg-emerald-50",
    title: "Deal Audi A3 finalizado — transferência concluída",
    timestamp: "há 12d",
  },
];

export default function RecentActivity(): React.JSX.Element {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={18} className="text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-700">Atividade recente</h3>
      </div>
      <ul className="space-y-3">
        {activity.map((item) => {
          const Icon = item.Icon;
          return (
            <li key={item.id} className="flex items-start gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.iconClass}`}
              >
                <Icon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800">{item.title}</p>
                <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                  <Clock size={11} />
                  {item.timestamp}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
