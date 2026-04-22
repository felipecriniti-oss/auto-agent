import {
  type MyDeal,
  type Opportunity,
  type PlanKey,
  mockMyDeals,
  mockOpportunities,
} from "@/lib/mock-data/v3";
import type { FuelType, Transmission, WishlistStatus } from "@/types/database";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type AppModule =
  | "wishlists"
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
 * Local wishlist shape. Mirrors supabase `wishlists` schema so Phase 6
 * migration is straightforward — only id generation changes (client uuid
 * → server default gen_random_uuid()).
 */
export interface LocalWishlist {
  id: string;
  name: string;
  brand: string;
  model: string;
  trim: string | null;
  year_min: number | null;
  year_max: number | null;
  km_max: number | null;
  price_max: number | null;
  fuel_type: FuelType[];
  transmission: Transmission[];
  armored: boolean | null;
  region_uf: string[];
  region_cities: string[];
  status: WishlistStatus;
  created_at: string;
  updated_at: string;
}

export type WishlistInput = Omit<LocalWishlist, "id" | "created_at" | "updated_at" | "status"> & {
  status?: WishlistStatus;
};

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

  // wishlists — local state; migrates to Supabase in Phase 6
  wishlists: LocalWishlist[];

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

  // wishlist actions
  createWishlist: (input: WishlistInput) => LocalWishlist;
  updateWishlist: (id: string, patch: Partial<WishlistInput>) => void;
  toggleWishlistStatus: (id: string) => void;
  deleteWishlist: (id: string) => void;
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
  | "wishlists"
  | "profileName"
  | "profileCity"
  | "profilePersona"
  | "pilotStage"
  | "pilotDiscoveredIds"
  | "autoModeOpportunityIds"
> {
  return {
    activeModule: "wishlists",
    currentPlan: "starter",
    onboardingComplete: false,
    opportunities: mockOpportunities,
    myDeals: mockMyDeals,
    activeOpportunityId: null,
    wishlists: [],
    profileName: null,
    profileCity: null,
    profilePersona: null,
    pilotStage: "idle",
    pilotDiscoveredIds: [],
    autoModeOpportunityIds: [],
  };
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `wl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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

      createWishlist: (input) => {
        const now = new Date().toISOString();
        const wishlist: LocalWishlist = {
          id: generateId(),
          name: input.name,
          brand: input.brand,
          model: input.model,
          trim: input.trim,
          year_min: input.year_min,
          year_max: input.year_max,
          km_max: input.km_max,
          price_max: input.price_max,
          fuel_type: input.fuel_type,
          transmission: input.transmission,
          armored: input.armored,
          region_uf: input.region_uf,
          region_cities: input.region_cities,
          status: input.status ?? "active",
          created_at: now,
          updated_at: now,
        };
        set({ wishlists: [wishlist, ...get().wishlists] });
        return wishlist;
      },

      updateWishlist: (id, patch) => {
        const now = new Date().toISOString();
        set({
          wishlists: get().wishlists.map((w) =>
            w.id === id ? { ...w, ...patch, updated_at: now } : w,
          ),
        });
      },

      toggleWishlistStatus: (id) => {
        const now = new Date().toISOString();
        set({
          wishlists: get().wishlists.map((w) =>
            w.id === id
              ? { ...w, status: w.status === "active" ? "paused" : "active", updated_at: now }
              : w,
          ),
        });
      },

      deleteWishlist: (id) => {
        set({ wishlists: get().wishlists.filter((w) => w.id !== id) });
      },
    }),
    {
      name: "autoagent-app-v1",
      storage: createJSONStorage(() => localStorage),
      version: 3,
      migrate: (persisted, version) => {
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
            wishlists: [],
          } as AppState;
        }
        if (version < 3) {
          // v2 → v3: add wishlists (default empty)
          return {
            ...(persisted as Partial<AppState>),
            wishlists: (persisted as { wishlists?: LocalWishlist[] }).wishlists ?? [],
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
        wishlists: state.wishlists,
        profileName: state.profileName,
        profileCity: state.profileCity,
        profilePersona: state.profilePersona,
        autoModeOpportunityIds: state.autoModeOpportunityIds,
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
