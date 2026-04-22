---
phase: 13-contracts-escrow-stripe
status: seeded
created: 2026-04-22
depends_on: [12-inbox-dashboard]
estimated_duration: 5-7 days
---

# Phase 13 — Contracts + escrow + Stripe

## Goal

Closing completo. Lojista clica "Assumir Deal" → paga fee via Stripe → recebe contato do PF + docs → PDF exclusividade + contrato gerados → (opcional fase 13b: escrow).

## Scope

### 13.1 — Stripe Connect setup

- Create Stripe account (modo BR)
- Products: 3 subscription tiers
  - Starter: R$197/mês
  - Premium: R$499/mês
  - Enterprise: R$1.997/mês
- Products: fee per deal (dynamic amount per opportunity)
- Webhook endpoint: `/api/stripe/webhook`

### 13.2 — Subscription checkout (pricing page)

- `/pricing` public page (reuse plans do Phase 5 settings module)
- "Assinar" button → Stripe Checkout session (subscription mode)
- Success: redirect `/app/onboarding` ou `/app`
- Cancel: back to pricing

Table `subscriptions` populated via webhook.

### 13.3 — Fee checkout (assumir deal)

- User clicks "Assumir Deal" em thread convergida
- `/api/checkout/deal` cria Checkout session (one-time payment mode)
- Amount = `opportunity.fee_amount` (computed from savings × plan_rate)
- On success: webhook cria `deals` row + trigger revelação do contato

### 13.4 — Webhook handler

`/api/stripe/webhook`:
- `checkout.session.completed` (subscription) → upsert subscriptions
- `checkout.session.completed` (one-time) → create deal + update opportunity.status='assumed'
- `customer.subscription.updated` → update tier/period
- `customer.subscription.deleted` → mark canceled
- Idempotent via event_id check

### 13.5 — PF contact reveal

Após deal created:
- UI mostra phone + email + endereço do PF (se coletado na thread)
- Instruções: "Entre em contato via WhatsApp — a AutoAgente já confirmou o preço e o interesse do vendedor"

### 13.6 — ZapSign integration (exclusividade digital)

- `/api/contracts/exclusivity` endpoint
- Input: opportunity + PF data
- Gera PDF template (template in `docs/templates/exclusivity.html`) com:
  - Dados do anunciante + lojista + carro + preço acordado
  - Cláusula de exclusividade 7 dias
- Envia via ZapSign API pro email/WhatsApp do PF pra assinar
- Webhook ZapSign → atualiza deal com signed URL

### 13.7 — Compra e venda contract

- Template maior
- Geração on-demand no UI
- ZapSign envio pra ambas as partes

### 13.8 — Escrow (13b — opcional MVP)

- Opcional: abrir conta segregada via Transfeera ou similar
- Lojista deposita valor do carro
- Sistema libera pro PF após transferência veicular confirmada no DETRAN
- Complexo (compliance BACEN) — avaliar se MVP precisa ou se "instrução de pagamento direto" é suficiente

## Key questions

1. Stripe BR: precisa CNPJ ativo. Confirmar com user o status.
2. ZapSign vs DocuSign vs Clicksign: ZapSign é BR-native, mais barato, API simples. Recomendo ZapSign.
3. Escrow: MVP skip (instrução direta) ou ship? Depende de feedback dos primeiros lojistas.

## Dependencies

- Phase 12 (deals flow existe)
- USER: CNPJ ativo, conta Stripe, conta ZapSign

## Success criteria

- [ ] User assina plano via Stripe Checkout
- [ ] User assume deal via Checkout — fee cobrado
- [ ] Webhook sync subscriptions e deals
- [ ] PF contact revelado pós-pagamento
- [ ] PDF exclusividade gerado e enviado via ZapSign
- [ ] Cancel subscription flow funciona

## Plans

TBD.
