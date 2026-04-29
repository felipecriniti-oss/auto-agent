import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAppForTests, useAppStore } from "./app";

/**
 * App store tests — covers wishlist actions, autoModeOpportunityIds, and the
 * marketplaceUnreadCount behavior introduced in 09-05 (D-12, W-01).
 *
 * Migration tests reach into zustand/persist's `migrate` function via the
 * persist config attached to the store creator. We re-create the store
 * factory's migrate logic by inspecting the same shape the production code
 * uses, but the cleanest approach is to read it back from the underlying
 * persist config. Since zustand v5 doesn't expose persist config directly on
 * the store, we instead seed `localStorage` with a v4-shaped payload and
 * trigger a fresh hydration via the persist API's `rehydrate` method.
 */

describe("app store", () => {
  beforeEach(() => {
    resetAppForTests();
  });
  afterEach(() => {
    resetAppForTests();
  });

  describe("marketplaceUnreadCount", () => {
    it("initial state is 0", () => {
      expect(useAppStore.getState().marketplaceUnreadCount).toBe(0);
    });

    it("incrementMarketplaceUnread increments by 1 each call", () => {
      useAppStore.getState().incrementMarketplaceUnread();
      expect(useAppStore.getState().marketplaceUnreadCount).toBe(1);
      useAppStore.getState().incrementMarketplaceUnread();
      useAppStore.getState().incrementMarketplaceUnread();
      expect(useAppStore.getState().marketplaceUnreadCount).toBe(3);
    });

    it("incrementMarketplaceUnread from undefined-key state lands at 1 (W-01 defensive)", () => {
      // Simulate a hydrated state where the migration didn't run for some
      // reason (defensive path) — the action must NOT produce NaN.
      useAppStore.setState({ marketplaceUnreadCount: undefined as unknown as number });
      useAppStore.getState().incrementMarketplaceUnread();
      expect(useAppStore.getState().marketplaceUnreadCount).toBe(1);
    });

    it("resetMarketplaceUnread lands at 0 from any value", () => {
      useAppStore.setState({ marketplaceUnreadCount: 7 });
      useAppStore.getState().resetMarketplaceUnread();
      expect(useAppStore.getState().marketplaceUnreadCount).toBe(0);
    });

    it("setMarketplaceUnread clamps negatives to 0", () => {
      useAppStore.getState().setMarketplaceUnread(-5);
      expect(useAppStore.getState().marketplaceUnreadCount).toBe(0);
    });

    it("setMarketplaceUnread accepts positive values", () => {
      useAppStore.getState().setMarketplaceUnread(12);
      expect(useAppStore.getState().marketplaceUnreadCount).toBe(12);
    });

    it("v4-persisted state lacking marketplaceUnreadCount migrates to 0 (W-01)", async () => {
      // Seed localStorage with a v4-shaped payload (NO marketplaceUnreadCount key)
      // and force the persist middleware to re-hydrate. The migrate branch for
      // version<5 must fill the missing key with 0.
      const v4State = {
        state: {
          activeModule: "wishlists",
          currentPlan: "starter",
          opportunities: [],
          myDeals: [],
          wishlists: [],
          autoModeOpportunityIds: [],
        },
        version: 4,
      };
      localStorage.setItem("autoagent-app-v1", JSON.stringify(v4State));

      // Trigger rehydration via the persist API.
      const persistApi = (
        useAppStore as unknown as {
          persist: { rehydrate: () => Promise<void> };
        }
      ).persist;
      await persistApi.rehydrate();

      const count = useAppStore.getState().marketplaceUnreadCount;
      expect(count).toBe(0);
      expect(typeof count).toBe("number");
      expect(Number.isNaN(count)).toBe(false);
    });
  });
});
