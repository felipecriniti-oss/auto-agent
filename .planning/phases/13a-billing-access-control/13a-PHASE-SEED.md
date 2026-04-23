---
phase: 13a-billing-access-control
status: seeded
created: 2026-04-22
promoted_from: 13-contracts-escrow-stripe (pivot 3 split)
depends_on: [06-supabase-integration]
estimated_duration: 4-5 days
priority: critical
---

# Phase 13a — Billing + Access Control + Plan Gating

> **Promovido de Phase 13** em pivot 3 (2026-04-22). Separado porque: (a) billing + plan gating é pré-requisito pra qualquer venda mesmo sem agente, (b) access control middleware é block pra Phase 12 (lojista só vê contato do PF se assinou plano ativo).

## Goal

Lojista pode:
1. Escolher um plano (Starter / Premium / Enterprise)
2. Pagar via Stripe Checkout recorrente (subscription)
3. Ter acesso gated por plano (quotas de due-diligence por mês, prioridade de marketplace, API access para Enterprise)
4. Cancelar, fazer upgrade, downgrade
5. Ver fatura + histórico

Sistema impõe limites de plano via middleware + hooks. UI do dashboard mostra quota usada / disponível.

## Pricing matrix (do PRD v3)

| Feature | Starter | Premium | Enterprise |
|---|---|---|---|
| Mensalidade | R$ 197 | R$ 499 | R$ 1.997 |
| Success fee | 6% | 3% | 2% |
| DD queries/mês | 10 | 50 | ∞ |
| Marketplace | Standard | Prioridade 1h | Realtime |
| Reserve length | 7 dias | 7 dias | Extended |
| Suporte | Chat | Dedicated | Account Manager |
| Multi-loja | ❌ | ✅ | ✅ |
| API access | ❌ | ❌ | ✅ |

(Obs: esse é o pricing do PRD v3 interno. **NÃO confundir com o pricing da landing autoagente.ai** que está R$0/1490/5900 — a landing tem outro modelo comercial. Decidir junto com user qual é o canônico antes de codar o Checkout.)

## Scope

### 13a.1 — Stripe account + products

- Criar conta Stripe modo BR (requer CNPJ AutoAgente — ver blockers)
- Criar 3 recurring products (Starter / Premium / Enterprise)
- Criar 1 one-time product (Success fee — dynamic amount)
- Price IDs gravados em `.env.local` (STRIPE_PRICE_STARTER, etc.)
- Webhook endpoint secret em `.env.local`

### 13a.2 — `/pricing` page

- Página pública, SSG
- Compara 3 tiers lado a lado
- CTA "Começar agora" em cada tier
- Se logged-in: CTA aparece como "Assinar" e redireciona pra Stripe Checkout com customer id
- Se logged-out: CTA redireciona pra /signup com plan pre-selecionado
- Usa shadcn Card, Fraunces no numero do plan, Inter pro resto

### 13a.3 — Checkout flow

- `/api/billing/checkout` route (server action ou API route):
  - Input: `{ priceId }`
  - Pega o user atual via Supabase server client
  - Busca ou cria Stripe Customer (linked to `users.stripe_customer_id`)
  - Cria Checkout Session (mode=subscription)
  - Return `{ url }` → client redireciona
- Success URL: `/app/billing/success?session_id={CHECKOUT_SESSION_ID}`
- Cancel URL: `/pricing`

### 13a.4 — Webhook handler

`/api/billing/webhook`:
- Valida signature
- Idempotency via `stripe_events` table (event_id UNIQUE)
- Eventos tratados:
  - `checkout.session.completed` (subscription mode) → upsert `subscriptions` + update `users.plan`
  - `customer.subscription.updated` → sync tier + current_period_end
  - `customer.subscription.deleted` → set status='canceled', optional downgrade to Starter free tier
  - `invoice.payment_failed` → flag `subscriptions.status='past_due'`, trigger email

### 13a.5 — Plan gating (access control)

**Middleware extension:**
- `src/middleware.ts` aumenta a session check pra carregar `user.plan` + `subscription.status`
- Protege rotas Enterprise-only (`/app/api/*` v2 API endpoints) com `requireEnterprise()` helper
- Headers `x-user-plan` + `x-quota-used` injetados pra downstream consumirem

**Quota enforcement (DD checks):**
- Tabela `usage_counters`:
  ```
  user_id uuid FK
  metric text (enum: 'dd_queries')
  period_month text (YYYY-MM)
  count int default 0
  PK (user_id, metric, period_month)
  ```
- Hook `useQuota('dd_queries')` returns `{ used, limit, canConsume }`
- DD query endpoint consome 1 do counter antes de executar; bloqueia se exceder
- Limit map: `{ starter: 10, premium: 50, enterprise: Infinity }`
- Reset mensal via pg_cron ou via chave composite (period_month)

**Feature flags baseados em plan:**
- `canUseApi(user) = user.plan === 'enterprise'`
- `canMultiLoja(user) = user.plan !== 'starter'`
- `marketplaceLatency(user) = user.plan === 'enterprise' ? 'realtime' : user.plan === 'premium' ? '1h' : 'standard'`
- Helpers em `src/lib/billing/plan-features.ts`

### 13a.6 — Billing dashboard (user-facing)

Tab "Billing" em `/app/settings`:
- Plan atual + próxima cobrança
- Quota usada/disponível (DD queries)
- Botão "Gerenciar assinatura" → Stripe Customer Portal
- Histórico de faturas (via Stripe API)

### 13a.7 — Onboarding integration

Flow pós-signup:
1. Email magic-link verificado (Phase 6)
2. Persona picker → empresa/CNPJ/cidade
3. **Seleção de plano obrigatória** (ou trial 7 dias sem cartão?)
4. Stripe Checkout
5. Redirect /app com plan ativo

(Decisão: trial sim/não? Recomendo sim, 14 dias trial pro Starter sem cartão, upgrade requer cartão.)

### 13a.8 — Success fee infra (sem executar ainda)

Tabela `deal_fees`:
```
id uuid PK
deal_id uuid FK deals
amount_brl numeric(12,2)
plan_tier text
savings_vs_fipe numeric(12,2)
fee_rate numeric(5,4)  -- 0.06 / 0.03 / 0.02
stripe_checkout_id text
stripe_paid_at timestamptz
status text check in ('pending','paid','failed','refunded')
```

Cálculo de fee: `fee = savings * fee_rate`. Fee cobrada no "Assumir Deal" do Phase 12 (Checkout one-time).

**Mas:** o Phase 12 inicial (modo manual contact) ainda não tem "Deal assumido" no fluxo completo — lojista vê opportunity, paga fee pra revelar contato, contata PF sozinho. Isso mantém fee mechanics testáveis sem agente.

## Tables (new)

```sql
subscriptions (
  id uuid PK,
  user_id uuid FK users UNIQUE,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text,
  tier text CHECK IN ('starter','premium','enterprise'),
  status text CHECK IN ('trialing','active','past_due','canceled','incomplete'),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  trial_end timestamptz,
  created_at, updated_at timestamptz
);

usage_counters (
  user_id uuid FK users,
  metric text CHECK IN ('dd_queries'),
  period_month text NOT NULL,  -- 'YYYY-MM'
  count int DEFAULT 0,
  PRIMARY KEY (user_id, metric, period_month)
);

stripe_events (
  id text PRIMARY KEY,  -- stripe event.id
  type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

deal_fees (
  id uuid PK,
  deal_id uuid FK deals,
  amount_brl numeric(12,2),
  plan_tier text,
  savings_vs_fipe numeric(12,2),
  fee_rate numeric(5,4),
  stripe_checkout_id text,
  stripe_paid_at timestamptz,
  status text CHECK IN ('pending','paid','failed','refunded') DEFAULT 'pending',
  created_at, updated_at timestamptz
);
```

(Migration 0002 no `supabase/migrations/` — encadeia 0001.)

## Security

- Webhook signature validation obrigatória
- Idempotency em todos eventos (event_id UNIQUE)
- Service role client server-side only
- RLS: user só vê sua own subscription + usage_counters
- `stripe_events` = service-role only

## LGPD

- Política de privacidade + Termos de uso publicados em `/privacidade` e `/termos` ANTES de Checkout ir vivo
- Checkbox obrigatório "Li e aceito" no signup

## Open questions

1. **Qual pricing é canônico?** PRD v3 (R$197/499/1997) ou landing autoagente.ai (R$0+8% / R$1490+4% / R$5900+2.5%)? **Bloqueia** Phase 13a.
2. **Trial sim ou não?** Recomendo 14 dias Starter trial sem cartão.
3. **Stripe BR ou Mercado Pago?** Stripe ou Asaas mencionado no PRD. Stripe BR requer CNPJ ativo — confirmar status.
4. **Downgrade handling?** Upgrade prorata automático via Stripe. Downgrade: end-of-period, sem refund?

## Dependencies

- Phase 6 (users table + auth + middleware)
- USER: CNPJ AutoAgente ativo (Stripe BR)
- USER: Stripe account criada, verified
- USER: Política privacidade + Termos publicados

## Success criteria

- [ ] User escolhe plano e paga via Checkout
- [ ] Webhook sincroniza subscription status
- [ ] DD quota enforced (Starter 10/mo)
- [ ] Plan features gated corretamente (middleware + UI)
- [ ] Billing dashboard funciona
- [ ] Cancel subscription flow funciona
- [ ] Testes: mock Stripe events cobrem webhook handlers
- [ ] Biome + typecheck + vitest verdes

## Plans

TBD.
