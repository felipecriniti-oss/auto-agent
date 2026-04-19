import type { Listing } from "@/lib/schemas/listing";
import type { Message, Role } from "@/lib/types/message";
import type { EndReason, Session, Status } from "@/lib/types/session";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const ARG_TAG_REGEX = /<\/?arg>/g;
const ARG_EXTRACT_REGEX = /<arg>(.*?)<\/arg>/g;

export function renderMessageContent(content: string): string {
  return content.replace(ARG_TAG_REGEX, "");
}

interface NegotiationState {
  currentSession: Session | null;
  history: Session[];
  initSession: (listing: Listing, fipe: number) => void;
  setFipe: (fipe: number) => void;
  startNegotiating: () => void;
  appendAgentChunk: (chunk: string) => void;
  finalizeAgentMessage: () => void;
  addSellerMessage: (content: string) => void;
  endSession: (reason: EndReason) => void;
  newNegotiation: () => void;
  getArgumentsUsed: () => string[];
}

const MAX_ROUNDS = 6 as const;

function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

function deriveTargetPrice(fipe: number): number {
  return Math.round(fipe * 0.75);
}

function deriveWalkAwayPrice(fipe: number): number {
  return Math.round(fipe * 0.9);
}

export const useNegotiationStore = create<NegotiationState>()(
  persist(
    (set, get) => ({
      currentSession: null,
      history: [],

      initSession: (listing, fipe) =>
        set({
          currentSession: {
            id: genId(),
            listing,
            fipe,
            targetPrice: deriveTargetPrice(fipe),
            walkAwayPrice: deriveWalkAwayPrice(fipe),
            maxRounds: MAX_ROUNDS,
            messages: [],
            round: 0,
            status: "idle" as Status,
            startedAt: null,
            endedAt: null,
            endReason: null,
          },
        }),

      setFipe: (fipe) => {
        const s = get().currentSession;
        if (!s) return;
        set({
          currentSession: {
            ...s,
            fipe,
            targetPrice: deriveTargetPrice(fipe),
            walkAwayPrice: deriveWalkAwayPrice(fipe),
          },
        });
      },

      startNegotiating: () => {
        const s = get().currentSession;
        if (!s) return;
        set({
          currentSession: { ...s, status: "negotiating", startedAt: isoNow() },
        });
      },

      appendAgentChunk: (chunk) => {
        const s = get().currentSession;
        if (!s) return;
        const last = s.messages[s.messages.length - 1];
        if (last?.role === ("agent" as Role) && last.isStreaming) {
          const updated: Message = { ...last, content: last.content + chunk };
          set({
            currentSession: {
              ...s,
              messages: [...s.messages.slice(0, -1), updated],
            },
          });
        } else {
          const newMsg: Message = {
            id: genId(),
            role: "agent",
            round: s.round + 1,
            content: chunk,
            timestamp: isoNow(),
            isStreaming: true,
          };
          set({
            currentSession: {
              ...s,
              messages: [...s.messages, newMsg],
              round: s.round + 1,
            },
          });
        }
      },

      finalizeAgentMessage: () => {
        const s = get().currentSession;
        if (!s) return;
        const last = s.messages[s.messages.length - 1];
        if (!last || !last.isStreaming) return;
        const finalized: Message = { ...last, isStreaming: false };
        const newMessages = [...s.messages.slice(0, -1), finalized];
        if (s.round >= s.maxRounds) {
          set({
            currentSession: {
              ...s,
              messages: newMessages,
              status: "ended",
              endedAt: isoNow(),
              endReason: "max_rounds",
            },
          });
        } else {
          set({ currentSession: { ...s, messages: newMessages } });
        }
      },

      addSellerMessage: (content) => {
        const s = get().currentSession;
        if (!s) return;
        const newMsg: Message = {
          id: genId(),
          role: "seller",
          round: s.round,
          content,
          timestamp: isoNow(),
        };
        set({
          currentSession: { ...s, messages: [...s.messages, newMsg] },
        });
      },

      endSession: (reason) => {
        const s = get().currentSession;
        if (!s) return;
        const messages = s.messages.filter((m) => !m.isStreaming);
        set({
          currentSession: {
            ...s,
            messages,
            status: "ended",
            endedAt: isoNow(),
            endReason: reason,
          },
        });
      },

      newNegotiation: () => {
        const s = get().currentSession;
        if (s && s.status === "ended") {
          set({ history: [...get().history, s], currentSession: null });
        } else {
          set({ currentSession: null });
        }
      },

      getArgumentsUsed: () => {
        const s = get().currentSession;
        if (!s) return [];
        const matches: string[] = [];
        for (const m of s.messages) {
          if (m.role !== "agent") continue;
          const found = [...m.content.matchAll(ARG_EXTRACT_REGEX)].map((x) => x[1].trim());
          matches.push(...found);
        }
        return Array.from(new Set(matches.filter((x) => x.length > 0)));
      },
    }),
    {
      name: "autoagent-playground-v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (persisted) => persisted as NegotiationState,
      partialize: (state) => ({
        currentSession: state.currentSession,
        history: state.history,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.warn("Failed to rehydrate negotiation store:", error);
        }
      },
    },
  ),
);
