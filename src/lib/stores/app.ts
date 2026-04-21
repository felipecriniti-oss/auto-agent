import {
  type MyDeal,
  type Opportunity,
  type PlanKey,
  mockMyDeals,
  mockOpportunities,
} from "@/lib/mock-data/v3";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type AppModule =
  | "marketplace"
  | "myDeals"
  | "backstage"
  | "dashboard"
  | "radar"
  | "settings"
  | "admin"
  | "onboarding"
  | "playground";

interface AppState {
  activeModule: AppModule;
  currentPlan: PlanKey;
  onboardingComplete: boolean;
  opportunities: Opportunity[];
  myDeals: MyDeal[];

  // actions
  setActiveModule: (module: AppModule) => void;
  setCurrentPlan: (plan: PlanKey) => void;
  completeOnboarding: () => void;
  addOpportunity: (opp: Opportunity) => void;
  assumeDeal: (oppId: number) => void;
}

function makeInitialState(): Pick<
  AppState,
  "activeModule" | "currentPlan" | "onboardingComplete" | "opportunities" | "myDeals"
> {
  return {
    activeModule: "marketplace",
    currentPlan: "starter",
    onboardingComplete: false,
    opportunities: mockOpportunities,
    myDeals: mockMyDeals,
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...makeInitialState(),

      setActiveModule: (module) => set({ activeModule: module }),

      setCurrentPlan: (plan) => set({ currentPlan: plan }),

      completeOnboarding: () => set({ onboardingComplete: true }),

      addOpportunity: (opp) => set({ opportunities: [opp, ...get().opportunities] }),

      assumeDeal: (oppId) => {
        const { opportunities, myDeals } = get();
        const opp = opportunities.find((o) => o.id === oppId);
        if (!opp) return;

        const newDeal: MyDeal = {
          id: opp.id,
          vehicle: `${opp.vehicle} ${opp.year}`,
          dealPrice: opp.dealPrice,
          fipe: opp.fipe,
          savings: opp.savings,
          fee: opp.fee,
          status: "contrato_pendente",
          assumedAt: "agora",
          nextStep: "Assinar contrato de compra/venda",
          progress: 25,
          sellerContact: "(11) 90000-0000",
          img: opp.img,
        };

        set({
          opportunities: opportunities.filter((o) => o.id !== oppId),
          myDeals: [newDeal, ...myDeals],
        });
      },
    }),
    {
      name: "autoagent-app-v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (persisted) => persisted as AppState,
      partialize: (state) => ({
        activeModule: state.activeModule,
        currentPlan: state.currentPlan,
        onboardingComplete: state.onboardingComplete,
        opportunities: state.opportunities,
        myDeals: state.myDeals,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.warn("Failed to rehydrate app store:", error);
        }
      },
    },
  ),
);

/**
 * Test-only helper — resets the app store to its initial seeded state and
 * clears its persisted key from localStorage. Mirrors the negotiation store
 * test reset pattern. Do not call from production code.
 */
export function resetAppForTests(): void {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem("autoagent-app-v1");
    } catch {
      // ignore (non-browser test env)
    }
  }
  useAppStore.setState(makeInitialState());
}
