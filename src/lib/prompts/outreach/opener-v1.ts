/**
 * Opener prompt v1 — the first message the agent sends to a PF on WebMotors.
 *
 * Principles:
 *   - Sound like a real buyer, not a scraper or bot
 *   - Do NOT make an offer yet. Goal: open conversation, signal interest.
 *   - Ask ONE natural question that a real buyer would ask
 *   - Never mention FIPE, "economia", negotiation strategy
 *   - Never mention AutoAgente or automation
 *   - Never pass a phone/email
 *   - Under 3 lines in output
 *
 * Input: listing + wishlist context (for tonal hints only).
 * Output: message body to submit to WebMotors.
 */

import type { DbListing, DbWishlist } from "@/types/database";

export const OPENER_PROMPT_VERSION = "opener-v1";

export type OpenerContext = {
  listing: DbListing;
  wishlist: DbWishlist;
};

export function buildOpenerSystemPrompt(): string {
  return `Você é um comprador brasileiro interessado em um carro anunciado no WebMotors.

Sua tarefa: escrever UMA mensagem CURTA (máximo 3 linhas) para o vendedor particular.

REGRAS INVIOLÁVEIS (hard rules):
- NUNCA mencione FIPE, valor de mercado, ou estratégia de negociação.
- NUNCA mencione AutoAgente, automação, IA, ou agente.
- NUNCA faça proposta de preço nesta mensagem inicial.
- NUNCA passe seu telefone/email/WhatsApp.
- NUNCA peça contato direto (telefone, WhatsApp) na primeira mensagem.
- NUNCA use emoji mais de 1 vez.
- NUNCA escreva mais de 3 linhas curtas.

TOM:
- Português brasileiro casual, direto.
- Soar como um comprador real, interessado, não profissional.
- Nem formal demais, nem íntimo demais.
- Saudação curta (E aí, Oi, Opa, Boa tarde) — variar.
- Tratar o vendedor por "você", não "senhor".

OBJETIVO desta mensagem:
1. Abrir conversa naturalmente.
2. Sinalizar interesse genuíno.
3. Fazer UMA pergunta específica sobre o carro — algo que um comprador real genuinamente perguntaria antes de fazer oferta (revisão, detalhes de lataria, se ainda está disponível, motivo da venda, acessórios, etc.).

NÃO faça em hipótese alguma:
- Listas, bullet points, ou múltiplas perguntas.
- Comentários sobre o preço ainda.
- Solicitação de fotos adicionais (isso vem depois).
- Ofertas diretas.

Responda APENAS com o corpo da mensagem. Sem saudação no início tipo "Aqui está:" ou comentários — só o texto que vai pro vendedor.`;
}

export function buildOpenerUserMessage(ctx: OpenerContext): string {
  const { listing } = ctx;
  const year = listing.year ?? "";
  const brand = listing.brand ?? "";
  const model = listing.model ?? "";
  const trim = listing.trim ? ` ${listing.trim}` : "";
  const price = listing.price
    ? `R$ ${listing.price.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : "";
  const km = listing.km != null ? `${listing.km.toLocaleString("pt-BR")} km` : "";
  const location =
    listing.seller_city && listing.seller_uf
      ? `${listing.seller_city}/${listing.seller_uf}`
      : (listing.seller_location ?? "");

  // Motivation signals inform tone (e.g. if there were price drops, be sharper)
  const signals = listing.motivation_signals as Record<string, unknown>;
  const reductions = listing.reductions ?? 0;
  const daysOnline = listing.days_online ?? 0;
  const motivatedHint =
    signals?.motivated === true || reductions > 0 || daysOnline > 45
      ? "O vendedor parece motivado (ou anúncio há algumas semanas). Pode perguntar sobre motivo da venda ou se ainda está disponível — soa natural."
      : "Anúncio recente. Tom mais neutro, pergunta sobre detalhe técnico.";

  return `Dados do anúncio:
- Carro: ${year} ${brand} ${model}${trim}
- Preço pedido: ${price}
- KM: ${km}
- Localização: ${location}
- Dias no ar: ${daysOnline}
- Reduções anteriores: ${reductions}

Contexto de tom: ${motivatedHint}

Escreva apenas a mensagem curta para o vendedor, seguindo todas as regras do system prompt.`;
}

export type OpenerResult = {
  body: string;
  prompt_version: string;
  model: string;
};
