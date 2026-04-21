"use client";

import { plansConfig } from "@/lib/mock-data/v3";
import { type AppModule, useAppStore } from "@/lib/stores/app";
import {
  BarChart3,
  Briefcase,
  Cpu,
  Handshake,
  type LucideIcon,
  MessageSquare,
  Rocket,
  Settings as SettingsIcon,
  ShieldCheck,
  Target,
} from "lucide-react";

interface SidebarItem {
  key: AppModule;
  label: string;
  icon: LucideIcon;
}

const ITEMS: SidebarItem[] = [
  { key: "marketplace", label: "Marketplace", icon: Handshake },
  { key: "myDeals", label: "Meus Deals", icon: Briefcase },
  { key: "backstage", label: "Backstage", icon: MessageSquare },
  { key: "dashboard", label: "Dashboard", icon: BarChart3 },
  { key: "radar", label: "Radar", icon: Target },
  { key: "settings", label: "Settings", icon: SettingsIcon },
  { key: "admin", label: "Admin", icon: ShieldCheck },
  { key: "onboarding", label: "Onboarding", icon: Rocket },
  { key: "playground", label: "Playground", icon: Cpu },
];

export default function Sidebar() {
  const activeModule = useAppStore((s) => s.activeModule);
  const setActiveModule = useAppStore((s) => s.setActiveModule);
  const currentPlan = useAppStore((s) => s.currentPlan);
  const plan = plansConfig[currentPlan];

  return (
    <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
      {/* Logo */}
      <div className="border-b border-slate-100 px-5 py-5">
        <p className="text-lg font-bold tracking-tight text-slate-900">AutoAgent</p>
        <p className="text-xs text-slate-500">painel lojista</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.key;
          return (
            <button
              type="button"
              key={item.key}
              onClick={() => setActiveModule(item.key)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon size={16} className={isActive ? "text-blue-600" : "text-slate-400"} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User chip */}
      <div className="border-t border-slate-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
            FL
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">Felipe Lojista</p>
            <p className="truncate text-xs text-slate-500">Auto Premium SP</p>
          </div>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 border border-blue-100">
            {plan.name}
          </span>
        </div>
      </div>
    </aside>
  );
}
