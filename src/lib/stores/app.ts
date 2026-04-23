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
 * Legacy persona type — kept as an alias during the Phase 6 migration so
 * older mock-data imports still compile. New profile data comes from
 * public.users via useProfile() and carries only a plan tier.
 */
export type Persona = "investidor" | "lojista_micro" | "grupo_medio";

export type PilotStage = "idle" | "searching" | "found" | "done";

interface AppState {
  activeModule: AppModule;
  currentPlan: PlanKey;
  opportunities: Opportunity[];
  myDeals: MyDeal[];
  activeOpportunityId: number | null;

  // wishlists — local state; migrates to Supabase in Phase 7
  wishlists: LocalWishlist[];

  // pilot / demo ergonomics
  pilotStage: PilotStage;
  pilotDiscoveredIds: number[]; // ids injected by the theatrical pilot sequence
  autoModeOpportunityIds: number[]; // opps that should auto-play a negotiation in Backstage

  // actions
  setActiveModule: (module: AppModule) => void;
  setCurrentPlan: (plan: PlanKey) => void;
  addOpportunity: (opp: Opportunity) => void;
  assumeDeal: (oppId: number) => void;
  setActiveOpportunity: (id: number | null) => void;
  startPilotStage: (stage: PilotStage) => void;
  markOpportunityAutoMode: (id: number, autoMode: boolean) => void;

  // wishlist actions
  createWishlist: (input: WishlistInput) => LocalWishlist;
  updateWishlist: (id: string, patch: Partial<WishlistInput>) => void;
  toggleWishlistStatus: (id: string) => void;
  deleteWishlist: (id: string) => void;
}

function makeInitialState(): Pick<
  AppState,
  | "activeModule"
  | "currentPlan"
  | "opportunities"
  | "myDeals"
  | "activeOpportunityId"
  | "wishlists"
  | "pilotStage"
  | "pilotDiscoveredIds"
  | "autoModeOpportunityIds"
> {
  return {
    activeModule: "wishlists",
    currentPlan: "starter",
    opportunities: mockOpportunities,
    myDeals: mockMyDeals,
    activeOpportunityId: null,
    wishlists: [],
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
      version: 4,
      migrate: (persisted, version) => {
        if (version < 2) {
          const initial = makeInitialState();
          return {
            ...initial,
            ...(persisted as Partial<AppState>),
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
        if (version < 4) {
          // v3 → v4: drop profileName/profileCity/profilePersona/
          // onboardingComplete — those fields now live in public.users
          // (Supabase). Strip them defensively so older localStorage doesn't
          // leak stale data into the UI.
          const {
            profileName: _n,
            profileCity: _c,
            profilePersona: _p,
            onboardingComplete: _o,
            ...rest
          } = persisted as Record<string, unknown>;
          return rest as unknown as AppState;
        }
        return persisted as AppState;
      },
      partialize: (state) => ({
        activeModule: state.activeModule,
        currentPlan: state.currentPlan,
        opportunities: state.opportunities,
        myDeals: state.myDeals,
        wishlists: state.wishlists,
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
