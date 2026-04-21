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

/**
 * Persona picker in the fake-signup flow maps to a default plan tier,
 * matching the personas profiled on autoagente.ai §07 PARA QUEM.
 */
export type Persona = "investidor" | "lojista_micro" | "grupo_medio";

export type PilotStage = "idle" | "searching" | "found" | "done";

interface AppState {
  activeModule: AppModule;
  currentPlan: PlanKey;
  onboardingComplete: boolean;
  opportunities: Opportunity[];
  myDeals: MyDeal[];
  activeOpportunityId: number | null;

  // profile (fake auth — real Supabase lands in Phase 6)
  profileName: string | null;
  profileCity: string | null;
  profilePersona: Persona | null;

  // pilot / demo ergonomics
  pilotStage: PilotStage;
  pilotDiscoveredIds: number[]; // ids injected by the theatrical pilot sequence
  autoModeOpportunityIds: number[]; // opps that should auto-play a negotiation in Backstage

  // actions
  setActiveModule: (module: AppModule) => void;
  setCurrentPlan: (plan: PlanKey) => void;
  completeOnboarding: () => void;
  addOpportunity: (opp: Opportunity) => void;
  assumeDeal: (oppId: number) => void;
  setActiveOpportunity: (id: number | null) => void;
  setProfile: (fields: {
    name: string;
    city: string;
    persona: Persona;
  }) => void;
  resetProfile: () => void;
  startPilotStage: (stage: PilotStage) => void;
  markOpportunityAutoMode: (id: number, autoMode: boolean) => void;
}

function personaToPlan(persona: Persona): PlanKey {
  switch (persona) {
    case "lojista_micro":
      return "premium";
    case "grupo_medio":
      return "enterprise";
    case "investidor":
      return "starter";
  }
}

function makeInitialState(): Pick<
  AppState,
  | "activeModule"
  | "currentPlan"
  | "onboardingComplete"
  | "opportunities"
  | "myDeals"
  | "activeOpportunityId"
  | "profileName"
  | "profileCity"
  | "profilePersona"
  | "pilotStage"
  | "pilotDiscoveredIds"
  | "autoModeOpportunityIds"
> {
  return {
    activeModule: "marketplace",
    currentPlan: "starter",
    onboardingComplete: false,
    opportunities: mockOpportunities,
    myDeals: mockMyDeals,
    activeOpportunityId: null,
    profileName: null,
    profileCity: null,
    profilePersona: null,
    pilotStage: "idle",
    pilotDiscoveredIds: [],
    autoModeOpportunityIds: [],
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

      setActiveOpportunity: (id) => set({ activeOpportunityId: id }),

      setProfile: ({ name, city, persona }) =>
        set({
          profileName: name,
          profileCity: city,
          profilePersona: persona,
          currentPlan: personaToPlan(persona),
          onboardingComplete: true,
        }),

      resetProfile: () =>
        set({
          profileName: null,
          profileCity: null,
          profilePersona: null,
          onboardingComplete: false,
        }),

      startPilotStage: (stage) => set({ pilotStage: stage }),

      markOpportunityAutoMode: (id, autoMode) => {
        const current = get().autoModeOpportunityIds;
        if (autoMode) {
          if (current.includes(id)) return;
          set({ autoModeOpportunityIds: [...current, id] });
        } else {
          set({ autoModeOpportunityIds: current.filter((x) => x !== id) });
        }
      },
    }),
    {
      name: "autoagent-app-v1",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persisted, version) => {
        // v1 → v2: add profile + pilot fields (default nulls/empties)
        if (version < 2) {
          const initial = makeInitialState();
          return {
            ...initial,
            ...(persisted as Partial<AppState>),
            profileName: null,
            profileCity: null,
            profilePersona: null,
            pilotStage: "idle" as PilotStage,
            pilotDiscoveredIds: [],
            autoModeOpportunityIds: [],
          } as AppState;
        }
        return persisted as AppState;
      },
      partialize: (state) => ({
        activeModule: state.activeModule,
        currentPlan: state.currentPlan,
        onboardingComplete: state.onboardingComplete,
        opportunities: state.opportunities,
        myDeals: state.myDeals,
        profileName: state.profileName,
        profileCity: state.profileCity,
        profilePersona: state.profilePersona,
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
