import type { Listing } from "@/lib/schemas/listing";
import type { Message } from "./message";

export type Status = "idle" | "negotiating" | "ended";
export type EndReason = "user_stopped" | "max_rounds" | "agent_hard_stop" | null;

export interface Session {
  id: string;
  listing: Listing;
  fipe: number;
  targetPrice: number;
  walkAwayPrice: number;
  maxRounds: 6;
  messages: Message[];
  round: number;
  status: Status;
  startedAt: string | null;
  endedAt: string | null;
  endReason: EndReason;
}
