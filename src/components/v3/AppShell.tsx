"use client";

import { Toaster } from "@/components/ui/sonner";
import { useAppStore } from "@/lib/stores/app";
import type { AppModule } from "@/lib/stores/app";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useOpportunityRealtime } from "@/lib/supabase/hooks/useOpportunityRealtime";
import { useSupabaseUser } from "@/lib/supabase/hooks/useSupabaseUser";
import { useRouter } from "next/navigation";
import { type ComponentType, useEffect } from "react";
import Sidebar from "./Sidebar";
import AdminModule from "./modules/AdminModule";
import BackstageModule from "./modules/BackstageModule";
import DashboardModule from "./modules/DashboardModule";
import MarketplaceModule from "./modules/MarketplaceModule";
import MyDealsModule from "./modules/MyDealsModule";
import OnboardingModule from "./modules/OnboardingModule";
import PlaygroundModule from "./modules/PlaygroundModule";
import RadarModule from "./modules/RadarModule";
import SettingsModule from "./modules/SettingsModule";
import WishlistModule from "./modules/WishlistModule";

const MODULES: Record<AppModule, ComponentType> = {
  wishlists: WishlistModule,
  marketplace: MarketplaceModule,
  myDeals: MyDealsModule,
  backstage: BackstageModule,
  dashboard: DashboardModule,
  radar: RadarModule,
  settings: SettingsModule,
  admin: AdminModule,
  onboarding: OnboardingModule,
  playground: PlaygroundModule,
};

export default function AppShell() {
  const activeModule = useAppStore((s) => s.activeModule);
  const ActiveComponent = MODULES[activeModule];
  const { user, isLoading } = useSupabaseUser();
  const router = useRouter();

  // 09-05: mount the realtime opportunity listener once at the shell so toasts
  // + sidebar badge fire regardless of which dashboard module is active. The
  // hook is a no-op until user is set + Supabase is configured.
  useOpportunityRealtime();

  // Belt-and-suspenders: middleware already redirects unauthed users to /login
  // when Supabase is configured. This guards the client-rendered path for the
  // brief window before middleware cookie-refresh settles, and degrades to a
  // "press on" no-op if Supabase isn't yet wired up (pre-6.1 bootstrap).
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    if (isLoading) return;
    if (!user) router.replace("/login");
  }, [isLoading, user, router]);

  if (isSupabaseConfigured() && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-sm text-slate-500">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 md:flex-row dark:bg-slate-950 dark:text-slate-100">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <ActiveComponent />
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
