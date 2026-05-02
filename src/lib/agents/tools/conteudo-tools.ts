/**
 * Tools available to the Conteudo agent.
 *
 * Conteudo curates the WhatsApp template library and runs A/B-style
 * variant tracking. The "library" is hand-curated for now (no
 * dedicated table); A/B results are recorded as agent_comms
 * notifications routed to the CMO until a proper analytics surface
 * exists.
 *
 * Tools:
 *   - list_templates: built-in library by use_case
 *   - get_outbound_message_stats: aggregate count of agent_messages
 *     by direction in a window — coarse signal of volume
 *   - propose_template_variant: pure structural helper for variant naming
 *   - record_ab_test_result: agent_comms notification to CMO
 *   - get_recent_agent_messages: sample of recent outbound messages
 *     (for qualitative review by the agent itself)
 *   - report_conteudo_summary: structured final response
 */

import { getSupabaseServiceRole } from "@/lib/supabase/server";
import type { AgentTool } from "../types";

// ─── Curated template library ─────────────────────────────────────

const TEMPLATE_LIBRARY: Array<{
  id: string;
  use_case:
    | "first_contact_pf"
    | "round1_rapport"
    | "round2_social_proof"
    | "round6_final_offer"
    | "lojista_welcome"
    | "lojista_kyc_nudge"
    | "lojista_re_engagement";
  variant: "A" | "B";
  body: string;
  notes: string;
}> = [
  {
    id: "fc_pf_a",
    use_case: "first_contact_pf",
    variant: "A",
    body: "Oi, {nome}! Vi seu anuncio do {modelo} {ano} no portal. Tenho um lojista parceiro com interesse — podemos conversar sobre uma proposta?",
    notes: "Direto, identifica modelo, propoe conversa.",
  },
  {
    id: "fc_pf_b",
    use_case: "first_contact_pf",
    variant: "B",
    body: "Boa tarde, {nome}. Sou da AutoAgente. Trabalhamos com lojistas que compram seminovos premium e seu {modelo} entrou no nosso radar — tem 1 minuto?",
    notes: "Mais formal, posiciona AutoAgente.",
  },
  {
    id: "r1_rapport_a",
    use_case: "round1_rapport",
    variant: "A",
    body: "Topa fechar em R$ {opening_offer}? Pago a vista, levo a vistoria por minha conta e cuido da transferencia. Posso confirmar?",
    notes: "Apresenta opening_offer com pacote completo.",
  },
  {
    id: "r2_sp_a",
    use_case: "round2_social_proof",
    variant: "A",
    body: "{nome}, alem de mim mais 2 lojistas estao olhando seu carro hoje. Se conseguirmos chegar perto de R$ {target_offer}, fecho amanha mesmo. O que acha?",
    notes: "Prova social branda + janela curta de decisao.",
  },
  {
    id: "r6_final_a",
    use_case: "round6_final_offer",
    variant: "A",
    body: "{nome}, minha melhor oferta e R$ {max_offer}. Entrego em 48h: vistoria, contrato e transferencia inclusos. Topa?",
    notes: "Final clara, sem emocao excessiva.",
  },
  {
    id: "loj_welcome_a",
    use_case: "lojista_welcome",
    variant: "A",
    body: "Bem-vindo a AutoAgente, {nome}! Em 24h liberamos as primeiras oportunidades curadas para o seu perfil. Qualquer duvida, e so chamar.",
    notes: "Welcome curto e operacional.",
  },
  {
    id: "loj_kyc_a",
    use_case: "lojista_kyc_nudge",
    variant: "A",
    body: "Oi {nome}, falta pouco! Recebemos seus documentos e estamos validando. Em ate 48h sua conta sera liberada para ver oportunidades.",
    notes: "KYC update; tom tranquilizador.",
  },
  {
    id: "loj_reeng_a",
    use_case: "lojista_re_engagement",
    variant: "A",
    body: "Oi {nome}, faz um tempo que nao te vemos por aqui. Temos {n} novas oportunidades no seu perfil esta semana. Quer dar uma olhada?",
    notes: "Re-engagement com gancho de quantidade.",
  },
];

const listTemplates: AgentTool = {
  name: "list_templates",
  description:
    "Return the curated WhatsApp template library. Optional filters by use_case and variant. Each entry includes id, use_case, variant (A/B), body (with placeholders), and notes about when to use it.",
  input_schema: {
    type: "object" as const,
    properties: {
      use_case: { type: "string" },
      variant: { type: "string", enum: ["A", "B"] },
    },
    required: [],
  },
  execute: async (input) => {
    const useCase = input.use_case as string | undefined;
    const variant = input.variant as "A" | "B" | undefined;
    const filtered = TEMPLATE_LIBRARY.filter(
      (t) => (!useCase || t.use_case === useCase) && (!variant || t.variant === variant),
    );
    return { templates: filtered, total: filtered.length };
  },
};

// ─── Tool: get_outbound_message_stats ─────────────────────────────

const getOutboundMessageStats: AgentTool = {
  name: "get_outbound_message_stats",
  description:
    "Count outbound vs inbound messages in agent_messages over a window (default last 7 days). Coarse signal of volume — granular response-rate by template requires a content_fingerprint column we don't have yet.",
  input_schema: {
    type: "object" as const,
    properties: {
      days: { type: "number", description: "Look-back window (default 7, max 30)" },
    },
    required: [],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const days = Math.min((input.days as number) || 7, 30);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const [outRes, inRes] = await Promise.all([
      supabase
        .from("agent_messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "outbound")
        .gte("created_at", since),
      supabase
        .from("agent_messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "inbound")
        .gte("created_at", since),
    ]);

    const outbound = outRes.count ?? 0;
    const inbound = inRes.count ?? 0;
    const responseRate = outbound > 0 ? Math.round((inbound / outbound) * 1000) / 10 : null;

    return {
      window_days: days,
      outbound,
      inbound,
      response_rate_pct: responseRate,
    };
  },
};

// ─── Tool: propose_template_variant ───────────────────────────────

const proposeTemplateVariant: AgentTool = {
  name: "propose_template_variant",
  description:
    "Pure helper that proposes a new variant id (e.g. {use_case}_{nextLetter}) given an existing variant. Use this BEFORE composing the new body. Returns the proposed id and a checklist of fields the new body should include (placeholders).",
  input_schema: {
    type: "object" as const,
    properties: {
      use_case: { type: "string" },
      based_on_id: { type: "string", description: "Optional — existing variant to evolve from" },
    },
    required: ["use_case"],
  },
  execute: async (input) => {
    const useCase = input.use_case as string;
    const existing = TEMPLATE_LIBRARY.filter((t) => t.use_case === useCase);
    const usedLetters = new Set(existing.map((t) => t.variant));
    const next = ["A", "B", "C", "D", "E"].find((l) => !usedLetters.has(l as "A" | "B")) ?? "C";
    const placeholderHints: Record<string, string[]> = {
      first_contact_pf: ["{nome}", "{modelo}", "{ano}"],
      round1_rapport: ["{nome}", "{opening_offer}"],
      round2_social_proof: ["{nome}", "{target_offer}"],
      round6_final_offer: ["{nome}", "{max_offer}"],
      lojista_welcome: ["{nome}"],
      lojista_kyc_nudge: ["{nome}"],
      lojista_re_engagement: ["{nome}", "{n}"],
    };
    return {
      proposed_id: `${useCase}_${next.toLowerCase()}`,
      proposed_variant: next,
      based_on: input.based_on_id ?? null,
      placeholder_checklist: placeholderHints[useCase] ?? ["{nome}"],
    };
  },
};

// ─── Tool: record_ab_test_result ──────────────────────────────────

const recordAbTestResult: AgentTool = {
  name: "record_ab_test_result",
  description:
    "Persist an A/B test result as an agent_comms notification routed to CMO. Includes the two variant ids, sample sizes, response rates, and the chosen winner.",
  input_schema: {
    type: "object" as const,
    properties: {
      use_case: { type: "string" },
      variant_a_id: { type: "string" },
      variant_b_id: { type: "string" },
      sample_a: { type: "number" },
      sample_b: { type: "number" },
      response_rate_a: { type: "number" },
      response_rate_b: { type: "number" },
      winner: { type: "string", enum: ["A", "B", "tie"] },
    },
    required: ["use_case", "variant_a_id", "variant_b_id", "winner"],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const summary = `A/B ${input.use_case}: ${input.variant_a_id} vs ${input.variant_b_id} -> winner ${input.winner} (rates ${input.response_rate_a ?? "?"} vs ${input.response_rate_b ?? "?"}, n=${input.sample_a ?? "?"}/${input.sample_b ?? "?"})`;

    const { error } = await supabase.from("agent_comms").insert({
      from_agent: "conteudo",
      to_agent: "cmo",
      message_type: "notification",
      priority: "medium",
      summary,
    });
    if (error) return { error: error.message };
    return { logged: true, summary };
  },
};

// ─── Tool: get_recent_agent_messages ──────────────────────────────

const getRecentAgentMessages: AgentTool = {
  name: "get_recent_agent_messages",
  description:
    "Return a sample of recent outbound agent_messages (for qualitative review). Direction='outbound' default. Use for tone/quality audits — limit small (default 10, max 25).",
  input_schema: {
    type: "object" as const,
    properties: {
      direction: { type: "string", enum: ["outbound", "inbound"] },
      limit: { type: "number" },
    },
    required: [],
  },
  execute: async (input) => {
    const supabase = getSupabaseServiceRole();
    const direction = (input.direction as "outbound" | "inbound") ?? "outbound";
    const limit = Math.min((input.limit as number) || 10, 25);

    const { data, error } = await supabase
      .from("agent_messages")
      .select("id, body, direction, sent_at, created_at")
      .eq("direction", direction)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { error: error.message, messages: [] };

    return {
      messages: (data ?? []).map((m) => ({
        id: m.id,
        body: (m.body ?? "").slice(0, 280),
        timestamp: m.sent_at ?? m.created_at,
      })),
      total: data?.length ?? 0,
    };
  },
};

// ─── Tool: report_conteudo_summary ────────────────────────────────

const reportConteudoSummary: AgentTool = {
  name: "report_conteudo_summary",
  description:
    "Final summary: library size by use_case, message volume in window, A/B tests recorded, qualitative notes about tone deviations spotted.",
  input_schema: {
    type: "object" as const,
    properties: {
      library_total: { type: "number" },
      outbound_window: { type: "number" },
      response_rate_pct: { type: "number" },
      ab_tests_recorded: { type: "number" },
      tone_alerts: {
        type: "array",
        items: { type: "string" },
      },
      notes: { type: "string" },
    },
    required: [],
  },
  execute: async (input) => {
    return {
      logged: true,
      summary: {
        library_total: input.library_total ?? TEMPLATE_LIBRARY.length,
        outbound_window: input.outbound_window ?? 0,
        response_rate_pct: input.response_rate_pct ?? null,
        ab_tests_recorded: input.ab_tests_recorded ?? 0,
        tone_alerts: input.tone_alerts ?? [],
        notes: input.notes ?? null,
      },
    };
  },
};

// ─── Export all conteudo tools ────────────────────────────────────

export const CONTEUDO_TOOLS: AgentTool[] = [
  listTemplates,
  getOutboundMessageStats,
  proposeTemplateVariant,
  recordAbTestResult,
  getRecentAgentMessages,
  reportConteudoSummary,
];
