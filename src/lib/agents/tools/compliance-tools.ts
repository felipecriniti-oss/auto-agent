/**
 * Tools available to the Compliance agent.
 *
 * Compliance gates the deal pipeline. Before the Negociador can engage a
 * seller, the listing must pass: vehicle status check (no leilão / sinistro
 * via existing filters + heuristic plate signals), seller-side WhatsApp
 * consent (opt-out list), and — for opportunities tied to a lojista — the
 * lojista's KYC must be `verified` and not expired.
 *
 * The vehicle-status check is deliberately conservative for now: the real
 * DETRAN / CarCheck API integration is a separate project. Today we re-run
 * the existing blocking filters against the listing title/attributes and
 * surface motivation signals that suggest fraud risk.
 *
 * Tools:
 *   - query_listings_for_compliance: pricing-decided listings without compliance
 *   - check_vehicle_status: re-run blocking filters + heuristic risk flags
 *   - check_kyc_lojista: read users.kyc_status / expiry for a given user_id
 *   - audit_whatsapp_consent: phone_hash lookup against opt_out_list
 *   - set_compliance_decision: persist verdict into listings.attributes.compliance
 *   - report_compliance_summary: structured run summary
 */

import { createHash } from "node:crypto";
import { detectBlockingFilter } from "@/lib/apify/filters";
import type { WebMotorsScraped } from "@/lib/apify/types";
import { getSupabaseServiceRole } from "@/lib/supabase/server";
import type { AgentTool } from "../types";

// ─── Tool: query_listings_for_compliance ──────────────────────────

const queryListingsForCompliance: AgentTool = {
  name: "query_listings_for_compliance",
  description:
    "Fetch active listings that already have a Pricing decision (go) and do not yet have a compliance verdict. Returns listing fields plus the embedded analysis + pricing JSONB.",
  input_schema: {
    type: "object" as const,
    properties: {
      limit: { type: "number", description: "Max rows (default 20, max 50)" },
    },
    required: [],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const limit = Math.min((input.limit as number) || 20, 50);

    const { data, error } = await supabase
      .from("listings")
      .select(
        "id, brand, model, year, price, fipe, seller_type, seller_uf, seller_city, listing_url, attributes",
      )
      .eq("status", "active")
      .order("savings_pct", { ascending: false, nullsFirst: false })
      .limit(limit * 3);

    if (error) return { error: error.message, listings: [] };

    const filtered = (data ?? [])
      .filter((row) => {
        const attr = row.attributes as Record<string, unknown> | null;
        if (!attr?.pricing) return false;
        if (attr?.compliance) return false;
        const pricing = attr.pricing as { decision?: string };
        return pricing.decision === "go";
      })
      .slice(0, limit);

    return {
      listings: filtered.map((row) => {
        const attr = row.attributes as Record<string, unknown> | null;
        return {
          id: row.id,
          brand: row.brand,
          model: row.model,
          year: row.year,
          price: row.price,
          fipe: row.fipe,
          seller_type: row.seller_type,
          seller_uf: row.seller_uf,
          seller_city: row.seller_city,
          listing_url: row.listing_url,
          analysis: attr?.analysis ?? null,
          pricing: attr?.pricing ?? null,
        };
      }),
      total: filtered.length,
    };
  },
};

// ─── Tool: check_vehicle_status ───────────────────────────────────
// Real DETRAN/CarCheck API integration is intentionally deferred. This
// re-runs the blocking filters and applies a small heuristic ruleset.

const SUSPECT_TITLE_KEYWORDS = [
  "alienad",
  "bloquead",
  "judicial",
  "transferenc",
  "sem document",
  "doc atrasad",
  "deb atrasad",
  "ipva atras",
];

const checkVehicleStatus: AgentTool = {
  name: "check_vehicle_status",
  description:
    "Conservative vehicle-status check. Re-runs the blocking filters (leilão/sinistro) on the listing title + attributes, then applies heuristic flags for restriction/judicial/document-issue language. Returns { status: 'clean' | 'review' | 'blocked', reasons: [] }. Real DETRAN integration is planned — until then, anything ambiguous returns 'review'.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string" },
      attributes: {
        type: "array",
        items: { type: "string" },
        description: "Attribute strings as scraped",
      },
      seller_type: { type: "string", enum: ["PF", "PJ"] },
      year: { type: "number" },
    },
    required: ["title"],
  },
  execute: async (input) => {
    const title = String(input.title ?? "");
    const attrs = (input.attributes as string[]) ?? [];
    const item: WebMotorsScraped = { title, attributes: attrs };

    const blockingReason = detectBlockingFilter(item);
    const reasons: string[] = [];
    let status: "clean" | "review" | "blocked" = "clean";

    if (blockingReason) {
      status = "blocked";
      reasons.push(`blocking_filter: ${blockingReason}`);
    }

    const haystack = `${title} ${attrs.join(" ")}`.toLowerCase();
    for (const kw of SUSPECT_TITLE_KEYWORDS) {
      if (haystack.includes(kw)) {
        if (status === "clean") status = "review";
        reasons.push(`suspect_keyword: ${kw}`);
      }
    }

    // Very old PF cars without recent km signal sometimes hide judicial issues
    const year = Number(input.year);
    if (
      Number.isFinite(year) &&
      year < new Date().getUTCFullYear() - 12 &&
      (input.seller_type as string) === "PF"
    ) {
      if (status === "clean") status = "review";
      reasons.push("very_old_pf_seller");
    }

    return {
      status,
      reasons,
      detran_check_pending:
        "DETRAN/CarCheck integration not yet wired — manual review required for 'review' verdicts",
    };
  },
};

// ─── Tool: check_kyc_lojista ──────────────────────────────────────

const checkKycLojista: AgentTool = {
  name: "check_kyc_lojista",
  description:
    "Read a lojista's KYC status from the users table. Returns kyc_status, expiry, and a normalized verdict ('approved' | 'expired' | 'pending' | 'rejected' | 'not_found').",
  input_schema: {
    type: "object" as const,
    properties: {
      user_id: { type: "string", description: "Lojista's user UUID" },
    },
    required: ["user_id"],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const userId = input.user_id as string;

    const { data, error } = await supabase
      .from("users")
      .select(
        "id, kyc_status, kyc_verified_at, kyc_expires_at, kyc_rejection_reason, cnpj_situacao",
      )
      .eq("id", userId)
      .maybeSingle();

    if (error) return { error: error.message, verdict: "not_found" };
    if (!data) return { verdict: "not_found", user_id: userId };

    const now = Date.now();
    const expired = data.kyc_expires_at ? Date.parse(data.kyc_expires_at) < now : false;

    let verdict: "approved" | "expired" | "pending" | "rejected" | "not_found" = "pending";
    if (data.kyc_status === "verified") verdict = expired ? "expired" : "approved";
    else if (data.kyc_status === "rejected") verdict = "rejected";
    else if (data.kyc_status === "expired") verdict = "expired";
    else verdict = "pending";

    return {
      user_id: userId,
      kyc_status: data.kyc_status,
      kyc_verified_at: data.kyc_verified_at,
      kyc_expires_at: data.kyc_expires_at,
      cnpj_situacao: data.cnpj_situacao,
      rejection_reason: data.kyc_rejection_reason,
      verdict,
    };
  },
};

// ─── Tool: audit_whatsapp_consent ─────────────────────────────────

function hashPhoneE164(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return createHash("sha256").update(digits).digest("hex");
}

const auditWhatsappConsent: AgentTool = {
  name: "audit_whatsapp_consent",
  description:
    "Check whether a phone number is on the WhatsApp opt-out list. Pass the raw phone (E.164 ideal); the tool hashes it before lookup. Returns { opted_out: boolean, opted_out_at: string|null, reason: string|null }.",
  input_schema: {
    type: "object" as const,
    properties: {
      phone: { type: "string", description: "Raw phone number (digits and optional +)" },
    },
    required: ["phone"],
  },
  execute: async (input) => {
    const phone = String(input.phone ?? "");
    if (!phone) return { error: "missing_phone", opted_out: false };

    const supabase = getSupabaseServiceRole();
    const phoneHash = hashPhoneE164(phone);

    const { data, error } = await supabase
      .from("opt_out_list")
      .select("opted_out_at, reason")
      .eq("phone_hash", phoneHash)
      .maybeSingle();

    if (error) return { error: error.message, opted_out: false };

    return {
      opted_out: !!data,
      opted_out_at: data?.opted_out_at ?? null,
      reason: data?.reason ?? null,
    };
  },
};

// ─── Tool: set_compliance_decision ────────────────────────────────

const setComplianceDecision: AgentTool = {
  name: "set_compliance_decision",
  description:
    "Persist the compliance verdict into the listing's `attributes.compliance` JSONB. Verdict 'approved' unblocks the Negociador; 'review' freezes the listing pending human review; 'blocked' permanently marks it.",
  input_schema: {
    type: "object" as const,
    properties: {
      listing_id: { type: "string" },
      verdict: { type: "string", enum: ["approved", "review", "blocked"] },
      vehicle_status: { type: "string", enum: ["clean", "review", "blocked"] },
      kyc_status: {
        type: "string",
        description: "approved/expired/pending/rejected/not_applicable",
      },
      whatsapp_opt_out: { type: "boolean" },
      reasons: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["listing_id", "verdict"],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const listingId = input.listing_id as string;

    const { data: existing, error: readErr } = await supabase
      .from("listings")
      .select("attributes")
      .eq("id", listingId)
      .maybeSingle();

    if (readErr) return { error: readErr.message, listing_id: listingId };
    if (!existing) return { error: "listing_not_found", listing_id: listingId };

    const prior = (existing.attributes as Record<string, unknown> | null) ?? {};
    const merged = {
      ...prior,
      compliance: {
        verdict: input.verdict,
        vehicle_status: input.vehicle_status ?? null,
        kyc_status: input.kyc_status ?? null,
        whatsapp_opt_out: input.whatsapp_opt_out ?? null,
        reasons: (input.reasons as string[]) ?? [],
        decided_at: new Date().toISOString(),
      },
    };

    const { error: writeErr } = await supabase
      .from("listings")
      .update({ attributes: merged })
      .eq("id", listingId);

    if (writeErr) return { error: writeErr.message, listing_id: listingId };
    return { listing_id: listingId, persisted: true, verdict: input.verdict };
  },
};

// ─── Tool: report_compliance_summary ──────────────────────────────

const reportComplianceSummary: AgentTool = {
  name: "report_compliance_summary",
  description:
    "Log a structured summary of the compliance run. Call this LAST with totals: how many checked, breakdown of approved/review/blocked, list of blocked listings (id, reason).",
  input_schema: {
    type: "object" as const,
    properties: {
      checked: { type: "number" },
      approved: { type: "number" },
      review: { type: "number" },
      blocked: { type: "number" },
      blocked_listings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            listing_id: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
      notes: { type: "string" },
    },
    required: ["checked"],
  },
  execute: async (input) => {
    return {
      logged: true,
      summary: {
        checked: input.checked ?? 0,
        approved: input.approved ?? 0,
        review: input.review ?? 0,
        blocked: input.blocked ?? 0,
        blocked_listings: input.blocked_listings ?? [],
        notes: input.notes ?? null,
      },
    };
  },
};

// ─── Export all compliance tools ──────────────────────────────────

export const COMPLIANCE_TOOLS: AgentTool[] = [
  queryListingsForCompliance,
  checkVehicleStatus,
  checkKycLojista,
  auditWhatsappConsent,
  setComplianceDecision,
  reportComplianceSummary,
];
