/**
 * Tools available to the Negociador agent.
 *
 * The Negociador is the most sensitive agent in the company — it speaks to
 * a real human (PF) on WhatsApp on behalf of the lojista. Its job is to
 * progress active negotiation threads through the 7-round playbook
 * (rapport → social proof → scarcity → reciprocity → commitment → final
 * offer → walkaway / close), staying inside the band defined by Pricing.
 *
 * The tools intentionally keep the LLM in charge of *what to say*. The
 * agent composes message text inside its own turn (the model is Opus
 * precisely because of this); the tools handle state, persistence, and
 * delivery via the existing pending_outbox queue.
 *
 * Tools:
 *   - query_threads_to_progress: threads waiting for our next move
 *   - get_thread_context: full state — thread + listing + analysis + pricing + last messages
 *   - get_round_playbook: round-specific guidance (objective, allowed tactics, max ask)
 *   - enqueue_outbound_message: write pending_outbox row + agent_messages row + bump round
 *   - mark_thread_outcome: close as converged / lost / escalated
 *   - report_negotiator_summary: structured run summary
 */

import { getSupabaseServiceRole } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import type { AgentTool } from "../types";

type ThreadUpdate = Tables["agent_threads"]["Update"];

const MAX_ROUNDS = 7;

// ─── Tool: query_threads_to_progress ──────────────────────────────

const queryThreadsToProgress: AgentTool = {
  name: "query_threads_to_progress",
  description:
    "Fetch agent_threads currently waiting for our next message. Default = threads where status='awaiting_agent_response'. Optionally include 'initiating' to start the conversation. Returns a small snapshot per thread; use get_thread_context for the full picture before composing.",
  input_schema: {
    type: "object" as const,
    properties: {
      include_initiating: {
        type: "boolean",
        description: "Include threads in 'initiating' state (no message sent yet). Default false.",
      },
      stale_after_hours: {
        type: "number",
        description:
          "If set, also include threads in 'awaiting_pf_response' that have been silent for >= N hours (re-engage signal). Default 48.",
      },
      limit: { type: "number", description: "Max threads (default 10, max 25)" },
    },
    required: [],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const limit = Math.min((input.limit as number) || 10, 25);
    const includeInitiating = input.include_initiating === true;
    const staleAfter = (input.stale_after_hours as number) ?? 48;
    const staleCutoff = new Date(Date.now() - staleAfter * 3_600_000).toISOString();

    const statuses: Array<"awaiting_agent_response" | "initiating"> = ["awaiting_agent_response"];
    if (includeInitiating) statuses.push("initiating");

    const { data: primary, error } = await supabase
      .from("agent_threads")
      .select(
        "id, opportunity_id, status, round, current_offer, target_price, pf_name, last_pf_message_at, last_agent_message_at, updated_at",
      )
      .in("status", statuses)
      .order("updated_at", { ascending: true })
      .limit(limit);

    if (error) return { error: error.message, threads: [] };

    let stale: typeof primary = [];
    if (primary && primary.length < limit) {
      const { data: staleData } = await supabase
        .from("agent_threads")
        .select(
          "id, opportunity_id, status, round, current_offer, target_price, pf_name, last_pf_message_at, last_agent_message_at, updated_at",
        )
        .eq("status", "awaiting_pf_response")
        .lt("last_agent_message_at", staleCutoff)
        .order("last_agent_message_at", { ascending: true })
        .limit(limit - primary.length);
      stale = staleData ?? [];
    }

    return {
      threads: [...(primary ?? []), ...(stale ?? [])].map((t) => ({
        thread_id: t.id,
        opportunity_id: t.opportunity_id,
        status: t.status,
        round: t.round,
        current_offer: t.current_offer,
        target_price: t.target_price,
        pf_name: t.pf_name,
        last_pf_at: t.last_pf_message_at,
        last_agent_at: t.last_agent_message_at,
        is_stale_re_engage: t.status === "awaiting_pf_response",
      })),
      total: (primary?.length ?? 0) + (stale?.length ?? 0),
    };
  },
};

// ─── Tool: get_thread_context ─────────────────────────────────────

const getThreadContext: AgentTool = {
  name: "get_thread_context",
  description:
    "Load full state for a single thread: thread row + linked opportunity + listing (with analysis + pricing JSONB) + last 8 messages in chronological order. Use this before composing the next message. Phone is returned masked (only last 4 digits) — actual delivery uses the existing outbox.",
  input_schema: {
    type: "object" as const,
    properties: {
      thread_id: { type: "string" },
      message_limit: { type: "number", description: "Last N messages (default 8, max 20)" },
    },
    required: ["thread_id"],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const threadId = input.thread_id as string;
    const msgLimit = Math.min((input.message_limit as number) || 8, 20);

    const { data: thread, error: tErr } = await supabase
      .from("agent_threads")
      .select("*")
      .eq("id", threadId)
      .maybeSingle();
    if (tErr) return { error: tErr.message };
    if (!thread) return { error: "thread_not_found", thread_id: threadId };

    let opportunity: Record<string, unknown> | null = null;
    let listing: Record<string, unknown> | null = null;
    if (thread.opportunity_id) {
      const { data: oppData } = await supabase
        .from("opportunities")
        .select("id, user_id, listing_id, match_score, status, fee_amount")
        .eq("id", thread.opportunity_id)
        .maybeSingle();
      opportunity = oppData ?? null;

      if (oppData?.listing_id) {
        const { data: listData } = await supabase
          .from("listings")
          .select("id, brand, model, year, km, price, fipe, savings_pct, listing_url, attributes")
          .eq("id", oppData.listing_id)
          .maybeSingle();
        listing = listData ?? null;
      }
    }

    const { data: messages } = await supabase
      .from("agent_messages")
      .select("id, direction, body, sent_at, received_at, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(msgLimit);

    const phone = thread.pf_phone ?? "";
    const maskedPhone = phone ? `***${phone.slice(-4)}` : null;

    return {
      thread: {
        id: thread.id,
        status: thread.status,
        round: thread.round,
        current_offer: thread.current_offer,
        target_price: thread.target_price,
        pf_name: thread.pf_name,
        pf_phone_masked: maskedPhone,
        first_message_sent_at: thread.first_message_sent_at,
        last_pf_message_at: thread.last_pf_message_at,
        last_agent_message_at: thread.last_agent_message_at,
        escalation_reason: thread.escalation_reason,
      },
      opportunity,
      listing: listing
        ? {
            id: listing.id,
            brand: listing.brand,
            model: listing.model,
            year: listing.year,
            km: listing.km,
            asking_price: listing.price,
            fipe: listing.fipe,
            savings_pct: listing.savings_pct,
            analysis: (listing.attributes as Record<string, unknown> | null)?.analysis ?? null,
            pricing: (listing.attributes as Record<string, unknown> | null)?.pricing ?? null,
            compliance: (listing.attributes as Record<string, unknown> | null)?.compliance ?? null,
          }
        : null,
      messages: (messages ?? []).reverse().map((m) => ({
        direction: m.direction,
        body: m.body,
        timestamp: m.sent_at ?? m.received_at ?? m.created_at,
      })),
    };
  },
};

// ─── Tool: get_round_playbook ─────────────────────────────────────

const ROUND_PLAYBOOK: Array<{
  round: number;
  name: string;
  objective: string;
  do: string[];
  dont: string[];
  offer_guidance: string;
}> = [
  {
    round: 1,
    name: "Rapport + Ancoragem Baixa",
    objective:
      "Estabelecer confianca, mostrar interesse genuino, e introduzir a primeira oferta (anchor low).",
    do: [
      "Cumprimentar pelo nome se houver",
      "Mencionar o anuncio especifico (modelo, ano)",
      "Demonstrar interesse e sugerir conversa rapida",
      "Apresentar a opening_offer da banda (5% abaixo do max_offer)",
    ],
    dont: ["Pressao excessiva", "Falar de defeitos", "Mencionar concorrentes"],
    offer_guidance: "Use band.opening_offer",
  },
  {
    round: 2,
    name: "Prova Social",
    objective: "Mencionar que ha outros compradores no radar, criando urgencia leve.",
    do: ["Mencionar 'temos outros parceiros olhando'", "Manter tom amigavel"],
    dont: ["Inventar nomes especificos", "Pressionar para resposta imediata"],
    offer_guidance: "Manter opening_offer",
  },
  {
    round: 3,
    name: "Escassez",
    objective: "Reforcar que a oportunidade e rara, citar dias-no-mercado / categoria.",
    do: ["Usar dados reais (dias online, categoria, peer median)", "Tom factual"],
    dont: ["Falsa urgencia", "Ameacas"],
    offer_guidance: "Subir 1-2% em direcao ao target_offer",
  },
  {
    round: 4,
    name: "Reciprocidade",
    objective:
      "Oferecer beneficio (vistoria gratis, pagamento rapido, retirada propria) em troca de movimento de preco.",
    do: ["Oferecer algo concreto e valioso", "Pedir movimento explicito de preco em troca"],
    dont: ["Prometer o que nao podemos cumprir"],
    offer_guidance: "Mover para target_offer",
  },
  {
    round: 5,
    name: "Commitment",
    objective:
      "Conseguir um pequeno compromisso (ex: 'topa fazer a vistoria semana que vem se chegarmos em X?').",
    do: ["Pedir confirmacao explicita"],
    dont: ["Pressao psicologica forte"],
    offer_guidance: "Manter target_offer ou subir 1% se necessario",
  },
  {
    round: 6,
    name: "Oferta Final",
    objective: "Apresentar a melhor oferta possivel, ate o max_offer (NUNCA acima).",
    do: [
      "Ser claro que e a melhor oferta",
      "Justificar com valor agregado (vistoria, contrato, transferencia)",
    ],
    dont: ["Ultrapassar max_offer", "Mentir sobre 'limite do gerente'"],
    offer_guidance: "Use band.max_offer (NUNCA exceder)",
  },
  {
    round: 7,
    name: "Walkaway / Closing",
    objective:
      "Fechar ou caminhar com graca. Se vendedor aceitar max_offer, converged. Caso contrario, lost.",
    do: [
      "Se aceitar: confirmar proximos passos (vistoria, contrato)",
      "Se recusar: agradecer e deixar porta aberta",
    ],
    dont: ["Ultrapassar walkaway sob NENHUMA circunstancia", "Insultar ou pressionar"],
    offer_guidance: "Use band.max_offer; walkaway absoluto se vendedor pedir mais",
  },
];

const getRoundPlaybook: AgentTool = {
  name: "get_round_playbook",
  description:
    "Return the playbook for the round we're about to compose. Includes objective, allowed tactics, prohibitions, and which value from the pricing band to use as our offer this round. Pure lookup — does not touch DB.",
  input_schema: {
    type: "object" as const,
    properties: {
      round: { type: "number", description: "1..7" },
    },
    required: ["round"],
  },
  execute: async (input) => {
    const round = Number(input.round);
    if (!Number.isFinite(round) || round < 1 || round > MAX_ROUNDS) {
      return { error: "invalid_round", valid_range: [1, MAX_ROUNDS] };
    }
    return ROUND_PLAYBOOK[round - 1];
  },
};

// ─── Tool: enqueue_outbound_message ───────────────────────────────

const enqueueOutboundMessage: AgentTool = {
  name: "enqueue_outbound_message",
  description:
    "Persist the next outbound message: writes the body into pending_outbox (the existing dispatch queue), creates an outbound row in agent_messages, advances thread.round, sets current_offer, and flips thread.status to 'awaiting_pf_response'. Returns the new message_id.",
  input_schema: {
    type: "object" as const,
    properties: {
      thread_id: { type: "string" },
      body: { type: "string", description: "Message text in pt-BR, ready to send" },
      offer_amount: {
        type: "number",
        description: "Offer included in this message (BRL). Stored as current_offer.",
      },
      next_round: {
        type: "number",
        description: "The round number this message represents (1..7)",
      },
      schedule_in_minutes: {
        type: "number",
        description: "Delay delivery by N minutes (default 0 = ASAP)",
      },
    },
    required: ["thread_id", "body", "next_round"],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const threadId = input.thread_id as string;
    const body = String(input.body ?? "").trim();
    const nextRound = Number(input.next_round);
    const offer = Number(input.offer_amount);
    const delayMin = Number(input.schedule_in_minutes) || 0;

    if (!body) return { error: "empty_body" };
    if (!Number.isFinite(nextRound) || nextRound < 1 || nextRound > MAX_ROUNDS) {
      return { error: "invalid_round" };
    }

    // Insert outbox row
    const scheduledFor = new Date(Date.now() + delayMin * 60_000).toISOString();
    const { data: outbox, error: outErr } = await supabase
      .from("pending_outbox")
      .insert({
        thread_id: threadId,
        body,
        scheduled_for: scheduledFor,
        status: "queued",
      })
      .select("id")
      .single();
    if (outErr) return { error: outErr.message };

    // Insert agent_messages outbound
    const { data: msg, error: msgErr } = await supabase
      .from("agent_messages")
      .insert({
        thread_id: threadId,
        direction: "outbound",
        body,
      })
      .select("id")
      .single();
    if (msgErr) return { error: msgErr.message, outbox_id: outbox?.id };

    // Update thread
    const update: ThreadUpdate = {
      round: nextRound,
      status: "awaiting_pf_response",
      last_agent_message_at: new Date().toISOString(),
    };
    if (Number.isFinite(offer) && offer > 0) update.current_offer = offer;
    if (nextRound === 1) update.first_message_sent_at = new Date().toISOString();

    const { error: thErr } = await supabase.from("agent_threads").update(update).eq("id", threadId);
    if (thErr) return { error: thErr.message, message_id: msg?.id };

    return {
      thread_id: threadId,
      message_id: msg?.id,
      outbox_id: outbox?.id,
      round: nextRound,
      current_offer: Number.isFinite(offer) ? offer : null,
      scheduled_for: scheduledFor,
    };
  },
};

// ─── Tool: mark_thread_outcome ────────────────────────────────────

const markThreadOutcome: AgentTool = {
  name: "mark_thread_outcome",
  description:
    "Close a negotiation thread with a final outcome: 'converged' (deal closed at agreed price), 'lost' (seller refused or unreachable), or 'escalated' (requires human intervention — e.g., seller pushed beyond walkaway, suspect fraud, complex objection). Updates thread.status, sets converged_at if applicable, writes escalation_reason if applicable.",
  input_schema: {
    type: "object" as const,
    properties: {
      thread_id: { type: "string" },
      outcome: { type: "string", enum: ["converged", "lost", "escalated"] },
      final_price: { type: "number", description: "Agreed price if converged (BRL)" },
      reason: {
        type: "string",
        description: "Required for lost/escalated; optional for converged",
      },
    },
    required: ["thread_id", "outcome"],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const threadId = input.thread_id as string;
    const outcome = input.outcome as "converged" | "lost" | "escalated";

    const update: ThreadUpdate = {
      status: outcome,
    };
    if (outcome === "converged") {
      update.converged_at = new Date().toISOString();
      const finalPrice = Number(input.final_price);
      if (Number.isFinite(finalPrice)) {
        update.current_offer = finalPrice;
      }
    }
    if (outcome === "escalated" || outcome === "lost") {
      update.escalation_reason = (input.reason as string) ?? null;
    }

    const { error } = await supabase.from("agent_threads").update(update).eq("id", threadId);
    if (error) return { error: error.message, thread_id: threadId };

    return { thread_id: threadId, outcome, persisted: true };
  },
};

// ─── Tool: report_negotiator_summary ──────────────────────────────

const reportNegotiatorSummary: AgentTool = {
  name: "report_negotiator_summary",
  description:
    "Log a structured summary of the negotiation run. Call this LAST: how many threads progressed, breakdown by outcome (advanced / converged / lost / escalated), and any thread that hit max_round.",
  input_schema: {
    type: "object" as const,
    properties: {
      threads_processed: { type: "number" },
      advanced: { type: "number", description: "Threads that received a new message and continue" },
      converged: { type: "number" },
      lost: { type: "number" },
      escalated: { type: "number" },
      escalations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            thread_id: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
      notes: { type: "string" },
    },
    required: ["threads_processed"],
  },
  execute: async (input) => {
    return {
      logged: true,
      summary: {
        threads_processed: input.threads_processed ?? 0,
        advanced: input.advanced ?? 0,
        converged: input.converged ?? 0,
        lost: input.lost ?? 0,
        escalated: input.escalated ?? 0,
        escalations: input.escalations ?? [],
        notes: input.notes ?? null,
      },
    };
  },
};

// ─── Export all negociador tools ──────────────────────────────────

export const NEGOCIADOR_TOOLS: AgentTool[] = [
  queryThreadsToProgress,
  getThreadContext,
  getRoundPlaybook,
  enqueueOutboundMessage,
  markThreadOutcome,
  reportNegotiatorSummary,
];
