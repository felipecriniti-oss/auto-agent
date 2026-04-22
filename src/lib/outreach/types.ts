/**
 * Shared outreach-pipeline types. These are the in-memory shapes that
 * the sender/receiver actors + Edge Functions pass around.
 */

import type { DbAgentThread, DbListing, DbWishlist } from "@/types/database";

export type OutreachJob = {
  outbox_id: string;
  thread_id: string;
  body: string;
  scheduled_for: string;
  attempt: number;
};

export type SenderResult =
  | { success: true; thread_url: string; webmotors_message_id?: string }
  | { success: false; error: string; retry_after_ms?: number };

export type InboundMessage = {
  thread_id: string;
  webmotors_message_id: string;
  sender: "pf" | "unknown";
  body: string;
  received_at: string;
};

/**
 * Output of a receiver actor run — aggregate state for multiple threads.
 */
export type ReceiverRunResult = {
  bot_account_id: string;
  checked_threads: number;
  new_messages: InboundMessage[];
  errors: Array<{ thread_id: string; error: string }>;
};

/**
 * Structured context passed to reply composer.
 */
export type ReplyComposerInput = {
  thread: DbAgentThread;
  listing: DbListing;
  wishlist: DbWishlist;
};
