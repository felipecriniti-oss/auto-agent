---
phase: 12-inbox-dashboard
status: seeded
created: 2026-04-22
depends_on: [11-inbound-agent-loop]
estimated_duration: 2-3 days
---

# Phase 12 — Inbox dashboard

## Goal

Lojista vê no dashboard, em tempo real, todas as threads que o agente está operando por ele. Pode ler tudo, mas **não pode intervir** — exceto em threads `escalated`. Quando thread converge, botão "Assumir Deal" aparece.

## Scope

### 12.1 — `OpportunitiesModule` (renomeia MarketplaceModule antigo)

Lista principal de opportunities do lojista, substituindo o MarketplaceModule de Phase 5:
- Filtros: status (pending, initiating, negotiating, converged, lost, escalated), wishlist (dropdown), região
- Cards mostram: foto do carro + modelo/ano + preço pedido/fipe/target + status do agente + última atividade
- Badge de prioridade baseada em `match_score`
- Click → drawer com detalhe

### 12.2 — Detail drawer (thread view)

Ao clicar numa opportunity:
- Left side: dados do listing (foto grande, specs, FIPE, localização)
- Right side: thread do agente em tempo real (Supabase realtime subscription)
  - Bubbles estilo chat
  - Ícones diferenciando inbound (PF) vs outbound (nosso agente)
  - Typing indicator quando thread `awaiting_agent_response` e nosso compose está rodando (raro, curto)
  - Status do thread destacado (initiating / awaiting PF / awaiting agent / converged / lost / escalated)
- Footer ações: "Ver no WebMotors" (link), "Pausar agente" (temporariamente, se lojista quiser intervir manualmente)

**Read-only por padrão.** Exceção: threads `escalated` permitem lojista escrever input que vai pro contexto da próxima resposta do agente.

### 12.3 — "Assumir Deal" flow

Quando `thread.status = 'converged'`:
- Card ganha destaque visual + badge "Pronto pra assumir"
- Botão proeminente no detail drawer: "Assumir Deal — pagar R$ X"
- Click → Phase 13 checkout flow (Stripe Checkout session)
- Após pagamento: cria `deals` row, libera contato PF no UI

### 12.4 — Escalation inbox

Separate tab/section pra threads `escalated`:
- Mostra threads que precisam input do lojista
- Reason destacado ("PF perguntou CRLV", "PF pediu telefone", etc.)
- Input textarea: "O que devo responder?"
- Submit → enfileira outbound + muda status de volta pra `negotiating`

Este é o único lugar onde lojista interage com agente conversation.

### 12.5 — Realtime updates

Supabase realtime subscriptions:
- `opportunities` filtered by `user_id` — novos status
- `agent_messages` filtered by `thread_id` do drawer aberto — novas mensagens
- Notificações toast: "Nova oportunidade", "PF respondeu no Honda Civic", "Thread convergida — assumir deal?"

### 12.6 — In-app notifications

Sidebar badge com count de:
- Novas opportunities não vistas
- Threads `converged` esperando assumir
- Threads `escalated` esperando input

Clear em visualizar.

### 12.7 — Email notifications (transactional)

Via Supabase Auth email templates:
- Novas oportunities (digest diário ou instantâneo — configurável)
- Thread convergida ("Pronta pra assumir — [link]")
- Thread escalada ("Precisamos de uma resposta sua — [link]")

### 12.8 — DashboardModule metrics

Update existing DashboardModule pra mostrar real numbers:
- Opportunities: total ativas, convergidas, perdidas (tudo vindo do DB agora)
- Deals: em progresso, finalizadas, valor total economizado
- Agent activity: mensagens enviadas hoje, taxa de resposta PF, taxa de convergência

## Key decisions

1. **Lojista não vê o contato do PF até pagar fee.** Mesmo com thread convergida. `pf_phone` e `pf_name` só expostos em deals row após Phase 13.
2. **Não pode intervir em threads não-escalated.** Razão: se lojista puder mandar mensagem, ele manda direct contato e pula fee. Hard rule do produto.
3. **Pausar agente:** opção pra casos raros de "lojista quer gerenciar sozinho". Mas opportunity fica pausada (não vira deal). Uso raro.

## Dependencies

- Phase 11 (threads existem + agent loop ativo)

## Success criteria

- [ ] Lojista vê grid de opportunities reais do DB
- [ ] Detail drawer mostra conversation realtime
- [ ] Status badges corretos
- [ ] "Assumir Deal" aparece só em converged
- [ ] Escalation tab permite input que vai pro próximo prompt
- [ ] Notificações in-app e email funcionam
- [ ] Dashboard metrics mostram números reais

## Plans

TBD.
