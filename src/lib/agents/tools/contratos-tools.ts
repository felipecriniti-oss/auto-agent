/**
 * Tools available to the Contratos agent.
 *
 * Contratos picks up converged threads (status='converged' on agent_threads)
 * that don't yet have a deal row, materializes a `deals` row tied to the
 * lojista, generates a contract draft, requests digital signature
 * (ZapSign integration is intentionally stubbed today), and tracks
 * signature status until 'signed'. After 'signed' the deal moves to
 * 'inspection' and is out of Contratos' scope.
 *
 * Tools:
 *   - query_threads_pending_contract: converged threads with no deal yet
 *   - create_deal_record: insert into deals table
 *   - generate_contract_draft: produce a contract data bundle (storage_path placeholder)
 *   - request_digital_signature: stub — would call ZapSign; today stamps zapsign_document_id
 *   - check_signature_status: read deal status; promote to 'signed' when done
 *   - report_contracts_summary: structured run summary
 */

import { randomUUID } from "node:crypto";
import { getSupabaseServiceRole } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import type { AgentTool } from "../types";

type DealUpdate = Tables["deals"]["Update"];

// ─── Tool: query_threads_pending_contract ─────────────────────────

const queryThreadsPendingContract: AgentTool = {
  name: "query_threads_pending_contract",
  description:
    "Find converged negotiation threads that don't yet have a deal row. Returns thread_id, opportunity_id, current_offer (final agreed price), and the lojista user_id from the linked opportunity.",
  input_schema: {
    type: "object" as const,
    properties: {
      limit: { type: "number", description: "Max threads (default 10, max 25)" },
    },
    required: [],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const limit = Math.min((input.limit as number) || 10, 25);

    const { data: threads, error } = await supabase
      .from("agent_threads")
      .select("id, opportunity_id, current_offer, converged_at, pf_name")
      .eq("status", "converged")
      .not("opportunity_id", "is", null)
      .order("converged_at", { ascending: true, nullsFirst: false })
      .limit(limit * 2);

    if (error) return { error: error.message, threads: [] };
    if (!threads || threads.length === 0) return { threads: [], total: 0 };

    const oppIds = threads.map((t) => t.opportunity_id).filter((id): id is string => !!id);

    const { data: opps } = await supabase
      .from("opportunities")
      .select("id, user_id, listing_id")
      .in("id", oppIds);
    const oppMap = new Map((opps ?? []).map((o) => [o.id, o]));

    const { data: existingDeals } = await supabase
      .from("deals")
      .select("opportunity_id")
      .in("opportunity_id", oppIds);
    const dealOppIds = new Set((existingDeals ?? []).map((d) => d.opportunity_id));

    const pending = threads
      .filter((t) => t.opportunity_id && !dealOppIds.has(t.opportunity_id))
      .slice(0, limit);

    return {
      threads: pending.map((t) => {
        const opp = t.opportunity_id ? oppMap.get(t.opportunity_id) : null;
        return {
          thread_id: t.id,
          opportunity_id: t.opportunity_id,
          listing_id: opp?.listing_id ?? null,
          lojista_user_id: opp?.user_id ?? null,
          final_price: t.current_offer,
          converged_at: t.converged_at,
          pf_name: t.pf_name,
        };
      }),
      total: pending.length,
    };
  },
};

// ─── Tool: create_deal_record ─────────────────────────────────────

const createDealRecord: AgentTool = {
  name: "create_deal_record",
  description:
    "Insert a new row in the `deals` table for a converged opportunity. Status starts at 'contract_pending'. Returns the new deal_id.",
  input_schema: {
    type: "object" as const,
    properties: {
      user_id: { type: "string", description: "Lojista user_id" },
      opportunity_id: { type: "string" },
      final_price: { type: "number", description: "Agreed price BRL (for fee_paid_amount basis)" },
    },
    required: ["user_id", "opportunity_id"],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();

    const { data, error } = await supabase
      .from("deals")
      .insert({
        user_id: input.user_id as string,
        opportunity_id: input.opportunity_id as string,
        status: "contract_pending",
      })
      .select("id, status")
      .single();

    if (error) return { error: error.message };
    return { deal_id: data?.id, status: data?.status, persisted: true };
  },
};

// ─── Tool: generate_contract_draft ────────────────────────────────
// Real PDF generation belongs to a separate service. For now we produce
// a structured bundle that downstream UI / ZapSign can consume.

const generateContractDraft: AgentTool = {
  name: "generate_contract_draft",
  description:
    "Produce a contract draft bundle (JSON) for a deal. Includes parties, vehicle, price, payment terms, standard clauses (warranty, hidden defects, ATPV-e). Returns a placeholder contract_url referencing where the PDF would live; PDF rendering is a separate concern. Persists contract_url + draft into the deal row.",
  input_schema: {
    type: "object" as const,
    properties: {
      deal_id: { type: "string" },
      vehicle: {
        type: "object",
        properties: {
          brand: { type: "string" },
          model: { type: "string" },
          year: { type: "number" },
          plate: { type: "string", description: "Optional — may be unknown at this stage" },
          renavam: { type: "string", description: "Optional" },
          chassi: { type: "string", description: "Optional" },
        },
      },
      seller: {
        type: "object",
        properties: {
          name: { type: "string" },
          cpf: { type: "string", description: "Masked or partial" },
        },
      },
      buyer_user_id: { type: "string" },
      final_price: { type: "number" },
    },
    required: ["deal_id", "vehicle", "seller", "buyer_user_id", "final_price"],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const dealId = input.deal_id as string;
    const draftId = randomUUID();
    const placeholderUrl = `https://contracts.autoagente.local/drafts/${draftId}.pdf`;

    const { error } = await supabase
      .from("deals")
      .update({
        contract_url: placeholderUrl,
      } satisfies DealUpdate)
      .eq("id", dealId);

    if (error) return { error: error.message, deal_id: dealId };

    return {
      deal_id: dealId,
      draft_id: draftId,
      contract_url: placeholderUrl,
      bundle: {
        vehicle: input.vehicle,
        seller: input.seller,
        buyer_user_id: input.buyer_user_id,
        final_price: input.final_price,
        clauses: [
          "compra e venda de veiculo seminovo conforme art. 481-532 CC",
          "garantia legal 90 dias para vicios ocultos",
          "ATPV-e a ser realizada em ate 30 dias",
          "pagamento mediante deposito bancario na conta da AutoAgente (escrow)",
        ],
        generated_at: new Date().toISOString(),
      },
      pdf_render_pending:
        "PDF generation pipeline not wired yet — bundle ready for ZapSign or template engine",
    };
  },
};

// ─── Tool: request_digital_signature ──────────────────────────────
// Stub for ZapSign / D4Sign integration. Today it just stamps a fake
// zapsign_document_id and leaves status='contract_pending' until
// check_signature_status is called manually with confirmed=true.

const requestDigitalSignature: AgentTool = {
  name: "request_digital_signature",
  description:
    "Request digital signature for a deal's contract. ZapSign integration is intentionally stubbed — this stamps a placeholder zapsign_document_id on the deal row. The real callback wiring will replace this with an HTTPS POST to ZapSign + webhook listener.",
  input_schema: {
    type: "object" as const,
    properties: {
      deal_id: { type: "string" },
      contract_url: { type: "string", description: "URL of the contract PDF/draft" },
      signer_email: { type: "string" },
      signer_name: { type: "string" },
    },
    required: ["deal_id"],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const dealId = input.deal_id as string;
    const zapsignDocId = `zs_stub_${randomUUID()}`;

    const { error } = await supabase
      .from("deals")
      .update({
        zapsign_document_id: zapsignDocId,
      } satisfies DealUpdate)
      .eq("id", dealId);

    if (error) return { error: error.message, deal_id: dealId };

    return {
      deal_id: dealId,
      zapsign_document_id: zapsignDocId,
      status: "signature_requested",
      stub_note:
        "ZapSign API integration deferred. Use check_signature_status with confirmed=true to manually advance for testing.",
    };
  },
};

// ─── Tool: check_signature_status ─────────────────────────────────

const checkSignatureStatus: AgentTool = {
  name: "check_signature_status",
  description:
    "Check (and optionally advance) the signature status of a deal. With confirmed=true the deal is promoted from 'contract_pending' to 'signed' (real flow this would be triggered by ZapSign webhook). Without confirmed it just reads current status.",
  input_schema: {
    type: "object" as const,
    properties: {
      deal_id: { type: "string" },
      confirmed: {
        type: "boolean",
        description: "If true, promote deal status to 'signed' (manual override for stub flow)",
      },
    },
    required: ["deal_id"],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const dealId = input.deal_id as string;

    const { data, error } = await supabase
      .from("deals")
      .select("id, status, zapsign_document_id, contract_url")
      .eq("id", dealId)
      .maybeSingle();

    if (error) return { error: error.message, deal_id: dealId };
    if (!data) return { error: "deal_not_found", deal_id: dealId };

    if (input.confirmed === true && data.status === "contract_pending") {
      const { error: upErr } = await supabase
        .from("deals")
        .update({ status: "signed" } satisfies DealUpdate)
        .eq("id", dealId);
      if (upErr) return { error: upErr.message, deal_id: dealId };
      return { deal_id: dealId, status: "signed", advanced: true };
    }

    return {
      deal_id: dealId,
      status: data.status,
      zapsign_document_id: data.zapsign_document_id,
      contract_url: data.contract_url,
    };
  },
};

// ─── Tool: report_contracts_summary ───────────────────────────────

const reportContractsSummary: AgentTool = {
  name: "report_contracts_summary",
  description:
    "Log a structured summary of the contracts run. Call this LAST: how many drafts generated, signatures requested, deals signed, and any pending overdue.",
  input_schema: {
    type: "object" as const,
    properties: {
      drafts_generated: { type: "number" },
      signatures_requested: { type: "number" },
      signed: { type: "number" },
      overdue: {
        type: "array",
        items: {
          type: "object",
          properties: {
            deal_id: { type: "string" },
            hours_pending: { type: "number" },
          },
        },
      },
      notes: { type: "string" },
    },
    required: [],
  },
  execute: async (input) => {
    return {
      logged: true,
      summary: {
        drafts_generated: input.drafts_generated ?? 0,
        signatures_requested: input.signatures_requested ?? 0,
        signed: input.signed ?? 0,
        overdue: input.overdue ?? [],
        notes: input.notes ?? null,
      },
    };
  },
};

// ─── Export all contratos tools ───────────────────────────────────

export const CONTRATOS_TOOLS: AgentTool[] = [
  queryThreadsPendingContract,
  createDealRecord,
  generateContractDraft,
  requestDigitalSignature,
  checkSignatureStatus,
  reportContractsSummary,
];
