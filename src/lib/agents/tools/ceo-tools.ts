/**
 * CEO-specific tools, layered on top of the shared C-level toolset.
 *
 * The CEO can:
 *   - dispatch to any of the four C-levels (not operational agents directly)
 *   - escalate to peers (declines `canEscalateToCeo`)
 *   - approve / reject deals above the company threshold (R$ 300k)
 *   - read consolidated company-wide KPIs
 *
 * The deal-approval flow today writes a `notification` agent_comms back to
 * CLO + CFO with the verdict; promoting the deal status to `signed` /
 * `canceled` requires manual sign-off until full ledger integration ships.
 */

import { getSupabaseServiceRole } from "@/lib/supabase/server";
import type { AgentTool } from "../types";
import { createCLevelTools } from "./clevel-tools";

const APPROVAL_THRESHOLD_BRL = 300_000;

const getCompanyKpis: AgentTool = {
  name: "get_company_kpis",
  description:
    "Consolidated week-to-date KPIs: agent_runs total + failure rate, listings discovered, opportunities created, threads opened/converged, deals signed, dollar throughput. Use this to drive the weekly strategy review.",
  input_schema: {
    type: "object" as const,
    properties: {
      days: { type: "number", description: "Look-back window (default 7)" },
    },
    required: [],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const days = Math.min((input.days as number) || 7, 30);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const [runs, listings, threadsConverged, dealsSigned, oppsCreated] = await Promise.all([
      supabase.from("agent_runs").select("status").gte("started_at", since),
      supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .gte("first_seen_at", since),
      supabase
        .from("agent_threads")
        .select("id", { count: "exact", head: true })
        .eq("status", "converged")
        .gte("converged_at", since),
      supabase
        .from("deals")
        .select("id", { count: "exact", head: true })
        .in("status", ["signed", "finalized"])
        .gte("created_at", since),
      supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
    ]);

    const runRows = runs.data ?? [];
    const failed = runRows.filter((r) => r.status === "failed" || r.status === "timeout").length;
    const failureRate = runRows.length > 0 ? Math.round((failed / runRows.length) * 1000) / 10 : 0;

    return {
      window_days: days,
      agent_runs: {
        total: runRows.length,
        failed,
        failure_rate_pct: failureRate,
      },
      listings_discovered: listings.count ?? 0,
      opportunities_created: oppsCreated.count ?? 0,
      threads_converged: threadsConverged.count ?? 0,
      deals_signed: dealsSigned.count ?? 0,
    };
  },
};

const listPendingDealApprovals: AgentTool = {
  name: "list_pending_deal_approvals",
  description: `List deals that require CEO approval — currently any deal whose final_offer is >= R$ ${APPROVAL_THRESHOLD_BRL.toLocaleString("pt-BR")} and is still in 'contract_pending'. Returns deal_id, final_offer (from the linked thread), brand+model (from listing), days_pending.`,
  input_schema: {
    type: "object" as const,
    properties: {
      limit: { type: "number" },
    },
    required: [],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const limit = Math.min((input.limit as number) || 10, 25);

    const { data: deals, error } = await supabase
      .from("deals")
      .select("id, opportunity_id, status, created_at")
      .eq("status", "contract_pending")
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) return { error: error.message, pending: [] };
    if (!deals || deals.length === 0) return { pending: [], total: 0 };

    const oppIds = deals.map((d) => d.opportunity_id).filter((id): id is string => !!id);

    const { data: opps } = await supabase
      .from("opportunities")
      .select("id, listing_id")
      .in("id", oppIds);
    const oppMap = new Map((opps ?? []).map((o) => [o.id, o]));

    const listingIds = (opps ?? []).map((o) => o.listing_id).filter(Boolean);
    const { data: listings } = await supabase
      .from("listings")
      .select("id, brand, model, year")
      .in("id", listingIds);
    const listingMap = new Map((listings ?? []).map((l) => [l.id, l]));

    const { data: threads } = await supabase
      .from("agent_threads")
      .select("opportunity_id, current_offer")
      .in("opportunity_id", oppIds);
    const threadOfferByOpp = new Map(
      (threads ?? []).map((t) => [t.opportunity_id ?? "", t.current_offer ?? 0]),
    );

    const now = Date.now();
    const enriched = deals
      .map((d) => {
        const opp = d.opportunity_id ? oppMap.get(d.opportunity_id) : null;
        const listing = opp?.listing_id ? listingMap.get(opp.listing_id) : null;
        const offer = d.opportunity_id ? (threadOfferByOpp.get(d.opportunity_id) ?? 0) : 0;
        return {
          deal_id: d.id,
          final_offer: offer,
          brand: listing?.brand ?? null,
          model: listing?.model ?? null,
          year: listing?.year ?? null,
          days_pending: Math.floor((now - Date.parse(d.created_at)) / 86_400_000),
        };
      })
      .filter((d) => d.final_offer >= APPROVAL_THRESHOLD_BRL)
      .slice(0, limit);

    return {
      threshold_brl: APPROVAL_THRESHOLD_BRL,
      pending: enriched,
      total: enriched.length,
    };
  },
};

const approveOrRejectDeal: AgentTool = {
  name: "approve_or_reject_deal",
  description: `Make an explicit decision on a deal above the threshold (R$ ${APPROVAL_THRESHOLD_BRL.toLocaleString("pt-BR")}). Writes an agent_comms notification to CLO + CFO with the verdict and reason. Does NOT promote the deal status — that happens in a separate ledger integration that requires human sign-off.`,
  input_schema: {
    type: "object" as const,
    properties: {
      deal_id: { type: "string" },
      verdict: { type: "string", enum: ["approve", "reject"] },
      reason: { type: "string" },
    },
    required: ["deal_id", "verdict", "reason"],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const summary = `CEO ${input.verdict} deal ${input.deal_id}: ${input.reason}`;

    const inserts = [
      {
        from_agent: "ceo",
        to_agent: "clo",
        message_type: "notification" as const,
        priority: "high" as const,
        deal_id: input.deal_id as string,
        summary,
      },
      {
        from_agent: "ceo",
        to_agent: "cfo",
        message_type: "notification" as const,
        priority: "high" as const,
        deal_id: input.deal_id as string,
        summary,
      },
    ];

    const { error } = await supabase.from("agent_comms").insert(inserts);
    if (error) return { error: error.message };

    return {
      deal_id: input.deal_id,
      verdict: input.verdict,
      notified: ["clo", "cfo"],
      pending_human_signoff: true,
    };
  },
};

export function createCeoTools(): AgentTool[] {
  const baseTools = createCLevelTools({
    selfSlug: "ceo",
    allowedSubordinates: ["cto", "cmo", "cfo", "clo"],
    canEscalateToCeo: false,
  });
  return [...baseTools, getCompanyKpis, listPendingDealApprovals, approveOrRejectDeal];
}
