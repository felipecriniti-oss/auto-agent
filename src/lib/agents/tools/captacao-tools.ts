/**
 * Tools available to the Captacao agent.
 *
 * Captacao runs the lojista lead-generation funnel:
 *   prospect identification -> first contact -> qualification -> onboarding -> KYC
 *
 * Today the prospect-identification side (Google Maps, OLX dealer scrape,
 * social media) is intentionally stubbed — Captacao instead operates on
 * the funnel that already exists inside the `users` table (signups,
 * onboarding stage, KYC status). Re-engagement of churned lojistas reads
 * the same source.
 *
 * Tools:
 *   - get_funnel_stats: counts by stage (registered, onboarded, kyc, churned)
 *   - list_recent_signups: lojistas registered in the last N days
 *   - list_kyc_pending: users stuck in kyc_status='submitted' for > N hours
 *   - list_inactive_lojistas: registered > 30d, never completed onboarding
 *   - record_outreach_touch: log a re-engagement attempt via agent_comms
 *   - report_captacao_summary: structured final response
 */

import { getSupabaseServiceRole } from "@/lib/supabase/server";
import type { AgentTool } from "../types";

// ─── Tool: get_funnel_stats ───────────────────────────────────────

const getFunnelStats: AgentTool = {
  name: "get_funnel_stats",
  description:
    "Snapshot of the lojista funnel from the users table. Returns counts: total, onboarding_complete, kyc_pending, kyc_submitted, kyc_verified, kyc_rejected, kyc_expired, plus paying-tier breakdown.",
  input_schema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
  execute: async () => {
    const supabase = getSupabaseServiceRole();

    const { data, error } = await supabase
      .from("users")
      .select("kyc_status, onboarding_complete, plan, created_at");

    if (error) return { error: error.message };

    const rows = data ?? [];
    const tally = (key: string, val: string | boolean) =>
      rows.filter((r) => (r as unknown as Record<string, unknown>)[key] === val).length;

    const planCount: Record<string, number> = {};
    for (const r of rows) {
      const p = (r.plan ?? "free") as string;
      planCount[p] = (planCount[p] ?? 0) + 1;
    }

    return {
      total: rows.length,
      onboarding_complete: tally("onboarding_complete", true),
      kyc_pending: tally("kyc_status", "pending"),
      kyc_submitted: tally("kyc_status", "submitted"),
      kyc_verified: tally("kyc_status", "verified"),
      kyc_rejected: tally("kyc_status", "rejected"),
      kyc_expired: tally("kyc_status", "expired"),
      by_plan: planCount,
    };
  },
};

// ─── Tool: list_recent_signups ────────────────────────────────────

const listRecentSignups: AgentTool = {
  name: "list_recent_signups",
  description:
    "List lojistas (users) that registered in the last N days (default 7, max 60). Returns id, email, company_name, kyc_status, onboarding_complete, created_at.",
  input_schema: {
    type: "object" as const,
    properties: {
      days: { type: "number", description: "Look-back window (default 7, max 60)" },
      limit: { type: "number", description: "Max rows (default 25, max 100)" },
    },
    required: [],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const days = Math.min((input.days as number) || 7, 60);
    const limit = Math.min((input.limit as number) || 25, 100);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data, error } = await supabase
      .from("users")
      .select("id, email, company_name, kyc_status, onboarding_complete, plan, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return { error: error.message, signups: [] };
    return { window_days: days, signups: data ?? [], count: data?.length ?? 0 };
  },
};

// ─── Tool: list_kyc_pending ───────────────────────────────────────

const listKycPending: AgentTool = {
  name: "list_kyc_pending",
  description:
    "List users stuck in kyc_status='submitted' for >= N hours (default 24). These need a nudge — either internal review or a follow-up message to the lojista.",
  input_schema: {
    type: "object" as const,
    properties: {
      stale_after_hours: { type: "number" },
      limit: { type: "number" },
    },
    required: [],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const stale = (input.stale_after_hours as number) || 24;
    const limit = Math.min((input.limit as number) || 25, 100);
    const cutoff = new Date(Date.now() - stale * 3_600_000).toISOString();

    const { data, error } = await supabase
      .from("users")
      .select("id, email, company_name, kyc_status, kyc_submitted_at")
      .eq("kyc_status", "submitted")
      .lt("kyc_submitted_at", cutoff)
      .order("kyc_submitted_at", { ascending: true })
      .limit(limit);

    if (error) return { error: error.message, pending: [] };
    return { stale_after_hours: stale, pending: data ?? [], count: data?.length ?? 0 };
  },
};

// ─── Tool: list_inactive_lojistas ─────────────────────────────────

const listInactiveLojistas: AgentTool = {
  name: "list_inactive_lojistas",
  description:
    "List users registered > 30 days ago with onboarding_complete=false. Targets for re-engagement campaign.",
  input_schema: {
    type: "object" as const,
    properties: {
      since_days: { type: "number", description: "Min age in days (default 30)" },
      limit: { type: "number" },
    },
    required: [],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const sinceDays = (input.since_days as number) || 30;
    const limit = Math.min((input.limit as number) || 25, 100);
    const cutoff = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

    const { data, error } = await supabase
      .from("users")
      .select("id, email, company_name, onboarding_complete, created_at")
      .eq("onboarding_complete", false)
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) return { error: error.message, inactive: [] };
    return { inactive: data ?? [], count: data?.length ?? 0 };
  },
};

// ─── Tool: record_outreach_touch ──────────────────────────────────

const recordOutreachTouch: AgentTool = {
  name: "record_outreach_touch",
  description:
    "Log a re-engagement / first-contact attempt. Writes an agent_comms notification (from='captacao', to='cmo' for visibility). Real WhatsApp dispatch lives in a separate path; this tool is for tracking effort.",
  input_schema: {
    type: "object" as const,
    properties: {
      target_user_id: { type: "string" },
      touch_type: {
        type: "string",
        enum: ["first_contact", "qualification", "kyc_nudge", "re_engagement"],
      },
      summary: { type: "string" },
    },
    required: ["target_user_id", "touch_type"],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();

    const { error } = await supabase.from("agent_comms").insert({
      from_agent: "captacao",
      to_agent: "cmo",
      message_type: "notification",
      priority: "low",
      summary: `${input.touch_type} -> user ${input.target_user_id}: ${input.summary ?? "n/a"}`,
    });

    if (error) return { error: error.message };
    return { logged: true, target_user_id: input.target_user_id, touch_type: input.touch_type };
  },
};

// ─── Tool: report_captacao_summary ────────────────────────────────

const reportCaptacaoSummary: AgentTool = {
  name: "report_captacao_summary",
  description:
    "Final summary of the captacao run: funnel snapshot, recent signups count, KYC pending touched, inactive lojistas re-engaged, and conversion deltas.",
  input_schema: {
    type: "object" as const,
    properties: {
      funnel: { type: "object", description: "Funnel snapshot from get_funnel_stats" },
      new_signups_window: { type: "number" },
      kyc_pending_touched: { type: "number" },
      inactive_re_engaged: { type: "number" },
      notes: { type: "string" },
    },
    required: [],
  },
  execute: async (input) => {
    return {
      logged: true,
      summary: {
        funnel: input.funnel ?? null,
        new_signups_window: input.new_signups_window ?? 0,
        kyc_pending_touched: input.kyc_pending_touched ?? 0,
        inactive_re_engaged: input.inactive_re_engaged ?? 0,
        notes: input.notes ?? null,
      },
    };
  },
};

// ─── Export all captacao tools ────────────────────────────────────

export const CAPTACAO_TOOLS: AgentTool[] = [
  getFunnelStats,
  listRecentSignups,
  listKycPending,
  listInactiveLojistas,
  recordOutreachTouch,
  reportCaptacaoSummary,
];
