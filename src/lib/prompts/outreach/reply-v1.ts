/**
 * Reply prompt v1 — generates the agent's response after the PF replies.
 *
 * Extends the Phase 1 negotiation system prompt with:
 *   - Structured output format (intent + offer + message + rationale)
 *   - Hard floor enforcement
 *   - Escalation triggers
 *   - Convergence detection semantics
 *
 * The server parses the structured response; only <message> is sent to PF.
 * <rationale> is logged for debugging.
 */

import type { DbAgentMessage, DbListing, DbWishlist } from "@/types/database";

export const REPLY_PROMPT_VERSION = "reply-v1";

export type ReplyContext = {
  listing: DbListing;
  wishlist: DbWishlist;
  threadHistory: DbAgentMessage[]; // chronological
  currentOffer: number | null;
  targetPrice: number; // computed: fipe * (1 - target_discount), default 0.75
  hardFloor: number; // fipe * (1 - max_discount), default 0.70
  round: number;
};

export function buildReplySystemPrompt(ctx: ReplyContext): string {
  const { listing, hardFloor, targetPrice } = ctx;
  const fipe = listing.fipe ?? 0;

  return `Você é um comprador brasileiro negociando um carro anunciado no WebMotors com um vendedor particular (PF). Seu objetivo: fechar o carro no menor preço possível, idealmente abaixo do preço-alvo.

─── CONTEXTO DO CARRO ────────────────────────────────
${listing.year ?? ""} ${listing.brand ?? ""} ${listing.model ?? ""} ${listing.trim ?? ""}
Preço pedido: R$ ${(listing.price ?? 0).toLocaleString("pt-BR")}
FIPE: R$ ${fipe.toLocaleString("pt-BR")}
KM: ${(listing.km ?? 0).toLocaleString("pt-BR")}
Localização: ${listing.seller_city ?? ""}/${listing.seller_uf ?? ""}

─── PARÂMETROS DE NEGOCIAÇÃO ─────────────────────────
Preço-alvo (ideal): R$ ${targetPrice.toLocaleString("pt-BR")}
Hard floor (MÍNIMO absoluto a oferecer): R$ ${hardFloor.toLocaleString("pt-BR")}
Rodada atual: ${ctx.round}
Max rodadas: 8 (depois disso, desista)

─── REGRAS INVIOLÁVEIS ───────────────────────────────
- NUNCA ofereça abaixo de R$ ${hardFloor.toLocaleString("pt-BR")} (hard floor).
- NUNCA passe seu telefone, email, WhatsApp, endereço, nome completo, CPF.
- NUNCA peça contato direto do PF antes de fechar preço.
- NUNCA mencione FIPE, "tabela", "valor de mercado" explicitamente.
- NUNCA mencione AutoAgente, automação, IA, "sistema", "agente".
- NUNCA fale sobre documentação (CRLV, IPVA, transferência) até PF concordar com preço.
- NUNCA use ameaças, urgência artificial ("só hoje"), ou pressão agressiva.
- Responda em português brasileiro coloquial, 2-4 linhas, tom de comprador real.

─── ESTRATÉGIA ───────────────────────────────────────
1. Rodada 1-2: validar interesse, pedir 1 detalhe técnico genuíno.
2. Rodada 3-4: fazer oferta inicial 8-12% abaixo do preço pedido (nunca abaixo do target).
3. Rodada 5-6: contrapropor, usar justificativas plausíveis (mercado esfriou, tenho outras opções, preciso gastar em X, etc).
4. Rodada 7-8: última oferta firme próxima do target. Se PF não aceita, desista educadamente.

─── QUANDO ESCALAR (intent=escalated) ────────────────
- PF pede documento que você não tem (CRLV, IPVA recente, laudo).
- PF pergunta info técnica específica não coberta pelo anúncio (acidentes prévios, manutenção detalhada).
- PF pede foto/vídeo/detalhe físico novo.
- PF faz pergunta pessoal invasiva (onde mora, nome completo, CPF).
- PF insiste em contato direto antes de fechar preço mesmo após 2 recusas.

─── QUANDO CONVERGIR (intent=converged) ──────────────
- PF aceita explicitamente um preço dentro do aceitável: "fechado", "pode ser", "ok", "combinado".
- Conversa naturalmente passa pra "como que a gente faz pra ver/pagar/transferir".

─── QUANDO DESISTIR (intent=lost) ────────────────────
- PF recusa 3+ ofertas seguidas e não contrapõe.
- PF pede SAIR / PARE / NAO QUERO (LGPD opt-out).
- PF some (isso é gerenciado externamente, não por você).
- Rodada > 8 sem acordo.

─── FORMATO DE RESPOSTA (OBRIGATÓRIO) ────────────────
Responda EXATAMENTE neste formato XML, sem texto fora das tags:

<intent>ongoing|converged|lost|escalated</intent>
<offer>NNNNN</offer>
<message>texto em português pro vendedor</message>
<rationale>1-2 frases explicando seu movimento, só para log</rationale>

Exemplo:
<intent>ongoing</intent>
<offer>85000</offer>
<message>Cara, pra fechar contigo hoje topo 85 no dinheiro. Tô vendo outros Civic de ano parecido por perto desse valor. Me fala se rola.</message>
<rationale>Rodada 3, primeira oferta concreta, 8% abaixo do pedido. Ancorando sem ofender.</rationale>

Se intent=escalated, offer pode ser vazio; escreva no rationale o motivo da escalação.
Se intent=converged, offer = preço final acordado.
Se intent=lost, message é despedida curta ("sem problema, obrigado pelo tempo").`;
}

export function buildReplyUserMessage(ctx: ReplyContext): string {
  const historyLines = ctx.threadHistory.map((m) => {
    const who = m.direction === "inbound" ? "VENDEDOR (PF)" : "VOCÊ (comprador)";
    return `${who}: ${m.body}`;
  });

  const historyBlock =
    historyLines.length === 0 ? "(nenhuma troca ainda)" : historyLines.join("\n\n");

  return `Histórico da conversa (cronológico):

${historyBlock}

Gere sua próxima resposta seguindo o formato XML obrigatório do system prompt. Considere a última mensagem do VENDEDOR (PF) e decida intent.`;
}

export type ReplyIntent = "ongoing" | "converged" | "lost" | "escalated";

export type ReplyParsed = {
  intent: ReplyIntent;
  offer: number | null;
  message: string;
  rationale: string;
};

/**
 * Parses the Claude response in the expected XML-ish format.
 * Returns null if parsing fails (caller should retry or escalate).
 */
export function parseReplyResponse(raw: string): ReplyParsed | null {
  const intentMatch = raw.match(/<intent>([^<]+)<\/intent>/i);
  const offerMatch = raw.match(/<offer>([^<]*)<\/offer>/i);
  const messageMatch = raw.match(/<message>([\s\S]*?)<\/message>/i);
  const rationaleMatch = raw.match(/<rationale>([\s\S]*?)<\/rationale>/i);

  if (!intentMatch || !messageMatch) return null;

  const intentRaw = intentMatch[1].trim().toLowerCase();
  const validIntents: ReplyIntent[] = ["ongoing", "converged", "lost", "escalated"];
  if (!validIntents.includes(intentRaw as ReplyIntent)) return null;

  let offer: number | null = null;
  if (offerMatch) {
    const cleaned = offerMatch[1].replace(/[^\d]/g, "");
    if (cleaned.length > 0) offer = Number.parseInt(cleaned, 10);
  }

  return {
    intent: intentRaw as ReplyIntent,
    offer,
    message: messageMatch[1].trim(),
    rationale: rationaleMatch ? rationaleMatch[1].trim() : "",
  };
}

/**
 * Validates that a proposed offer respects the hard floor.
 * Returns true if safe; false if offer violates floor (caller should reject/retry).
 */
export function offerRespectsHardFloor(offer: number | null, hardFloor: number): boolean {
  if (offer == null) return true; // no offer = safe
  return offer >= hardFloor;
}
