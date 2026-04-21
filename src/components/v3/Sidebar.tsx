"use client";

import ThemeToggle from "@/components/v3/ThemeToggle";
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
import Image from "next/image";

interface SidebarItem {
  key: AppModule;
  label: string;
  icon: LucideIcon;
  description?: string;
}

interface SidebarGroup {
  label: string;
  items: SidebarItem[];
}

const GROUPS: SidebarGroup[] = [
  {
    label: "Operação",
    items: [
      {
        key: "marketplace",
        label: "Marketplace",
        icon: Handshake,
        description: "Oportunidades pré-negociadas",
      },
      {
        key: "backstage",
        label: "Backstage",
        icon: MessageSquare,
        description: "Agente ao vivo",
      },
      {
        key: "myDeals",
        label: "Meus Deals",
        icon: Briefcase,
        description: "Assumidos",
      },
    ],
  },
  {
    label: "Inteligência",
    items: [
      { key: "dashboard", label: "Dashboard", icon: BarChart3 },
      { key: "radar", label: "Radar", icon: Target },
    ],
  },
  {
    label: "Conta",
    items: [
      { key: "settings", label: "Configurações", icon: SettingsIcon },
      { key: "onboarding", label: "Onboarding", icon: Rocket },
    ],
  },
  {
    label: "Interno",
    items: [
      { key: "admin", label: "Admin", icon: ShieldCheck },
      { key: "playground", label: "Playground", icon: Cpu },
    ],
  },
];

const PLAN_BADGE_STYLES: Record<string, string> = {
  starter:
    "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700",
  premium:
    "bg-[#4C46DC]/10 text-[#4C46DC] ring-[#4C46DC]/30 dark:bg-[#4C46DC]/20 dark:text-[#a8a1ff] dark:ring-[#4C46DC]/40",
  enterprise:
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800",
};

export default function Sidebar(): React.JSX.Element {
  const activeModule = useAppStore((s) => s.activeModule);
  const setActiveModule = useAppStore((s) => s.setActiveModule);
  const currentPlan = useAppStore((s) => s.currentPlan);
  const plan = plansConfig[currentPlan];

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950">
      {/* Logo */}
      <div className="border-b border-slate-200/80 px-5 py-5 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Image
            src="/logo.jpeg"
            alt="AutoAgente"
            width={520}
            height={180}
            className="h-10 w-auto select-none dark:brightness-110"
            priority
          />
          <span className="ml-auto rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            v3
          </span>
        </div>
        <p className="mt-2 text-[11px] font-medium tracking-wide text-slate-500 dark:text-slate-400">
          painel do lojista · piloto SP
        </p>
      </div>

      {/* Nav with groups */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeModule === item.key;
                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => setActiveModule(item.key)}
                    className={`group relative flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      isActive
                        ? "bg-[#4C46DC]/[0.08] text-[#4C46DC] dark:bg-[#4C46DC]/20 dark:text-[#a8a1ff]"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100"
                    }`}
                  >
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-r-full bg-[#4C46DC]"
                      />
                    )}
                    <Icon
                      size={18}
                      strokeWidth={isActive ? 2.25 : 1.75}
                      className={
                        isActive
                          ? "mt-0.5 text-[#4C46DC] dark:text-[#a8a1ff]"
                          : "mt-0.5 text-slate-400 transition-colors group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300"
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium leading-tight">{item.label}</span>
                      {item.description && (
                        <span
                          className={`mt-0.5 block text-[11px] leading-tight ${
                            isActive
                              ? "text-[#4C46DC]/70 dark:text-[#a8a1ff]/70"
                              : "text-slate-400 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-400"
                          }`}
                        >
                          {item.description}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User chip + theme toggle */}
      <div className="space-y-2 border-t border-slate-200/80 px-4 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50/60 p-3 ring-1 ring-inset ring-slate-200/60 dark:bg-slate-900/60 dark:ring-slate-800">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4C46DC] to-[#6B5BE8] text-sm font-bold text-white shadow-sm">
            FL
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              Felipe Lojista
            </p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              Auto Premium · SP
            </p>
          </div>
          <span
            className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] ring-1 ring-inset ${PLAN_BADGE_STYLES[currentPlan]}`}
          >
            {plan.name}
          </span>
        </div>
        <ThemeToggle />
      </div>
    </aside>
  );
}
