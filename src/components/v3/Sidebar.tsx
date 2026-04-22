"use client";

import ThemeToggle from "@/components/v3/ThemeToggle";
import { plansConfig } from "@/lib/mock-data/v3";
import { type AppModule, useAppStore } from "@/lib/stores/app";
import {
  BarChart3,
  Briefcase,
  Cpu,
  Handshake,
  ListChecks,
  type LucideIcon,
  Menu,
  MessageSquare,
  Rocket,
  Settings as SettingsIcon,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";

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
        key: "wishlists",
        label: "Wishlists",
        icon: ListChecks,
        description: "Carros que você quer",
      },
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

const PERSONA_LABELS: Record<string, string> = {
  investidor: "Investidor PJ",
  lojista_micro: "Lojista Micro",
  grupo_medio: "Grupo Médio",
};

function deriveInitials(name: string | null): string {
  if (!name) return "AA";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "AA";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default function Sidebar(): React.JSX.Element {
  const activeModule = useAppStore((s) => s.activeModule);
  const setActiveModule = useAppStore((s) => s.setActiveModule);
  const currentPlan = useAppStore((s) => s.currentPlan);
  const profileName = useAppStore((s) => s.profileName);
  const profileCity = useAppStore((s) => s.profileCity);
  const profilePersona = useAppStore((s) => s.profilePersona);
  const plan = plansConfig[currentPlan];

  const displayName = profileName ?? "Convidado";
  const displaySubline = profileCity
    ? profilePersona
      ? `${PERSONA_LABELS[profilePersona] ?? "Lojista"} · ${profileCity}`
      : profileCity
    : "Piloto SP";
  const initials = deriveInitials(profileName);

  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (key: AppModule): void => {
    setActiveModule(key);
    setMobileOpen(false);
  };

  const activeLabel =
    GROUPS.flatMap((g) => g.items).find((i) => i.key === activeModule)?.label ?? "Dashboard";

  return (
    <>
      {/* Mobile top bar — visible below md */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <Image
            src="/autoagente-whatsapp.svg"
            alt=""
            width={40}
            height={40}
            className="h-7 w-7 select-none rounded-lg ring-1 ring-slate-200 dark:ring-slate-800"
            priority
          />
          <span className="font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            AutoAgente
          </span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            · {activeLabel}
          </span>
        </div>
        <div className="w-9" aria-hidden="true" />
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
        />
      )}

      {/* Sidebar — drawer on mobile, static on md+ */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r border-slate-200/80 bg-white transition-transform duration-200 ease-out dark:border-slate-800 dark:bg-slate-950 md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="border-b border-slate-200/80 px-5 py-5 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Image
              src="/autoagente-whatsapp.svg"
              alt=""
              width={40}
              height={40}
              className="h-9 w-9 select-none rounded-xl ring-1 ring-slate-200 dark:ring-slate-800"
              priority
            />
            <span className="font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              AutoAgente
            </span>
            <span className="ml-auto rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              v3
            </span>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"
              aria-label="Fechar menu"
            >
              <X size={16} />
            </button>
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
                      onClick={() => handleNav(item.key)}
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
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {displayName}
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {displaySubline}
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
    </>
  );
}
