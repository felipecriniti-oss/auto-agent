"use client";

import { Toaster } from "@/components/ui/sonner";
import { useAppStore } from "@/lib/stores/app";
import type { AppModule } from "@/lib/stores/app";
import type { ComponentType } from "react";
import Sidebar from "./Sidebar";
import SignupView from "./SignupView";
import AdminModule from "./modules/AdminModule";
import BackstageModule from "./modules/BackstageModule";
import DashboardModule from "./modules/DashboardModule";
import MarketplaceModule from "./modules/MarketplaceModule";
import MyDealsModule from "./modules/MyDealsModule";
import OnboardingModule from "./modules/OnboardingModule";
import PlaygroundModule from "./modules/PlaygroundModule";
import RadarModule from "./modules/RadarModule";
import SettingsModule from "./modules/SettingsModule";

const MODULES: Record<AppModule, ComponentType> = {
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
  const onboardingComplete = useAppStore((s) => s.onboardingComplete);
  const ActiveComponent = MODULES[activeModule];

  // Fake-auth gate: if the lojista hasn't done the signup step, gate the whole
  // /app behind SignupView. Real Supabase auth lands in Phase 6.
  if (!onboardingComplete) {
    return (
      <>
        <SignupView />
        <Toaster richColors position="top-right" />
      </>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden">
        <ActiveComponent />
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
