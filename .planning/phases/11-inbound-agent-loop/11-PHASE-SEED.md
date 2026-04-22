---
phase: 11-inbound-agent-loop
status: seeded
created: 2026-04-22
depends_on: [10-outreach-sender]
estimated_duration: 4-5 days
---

# Phase 11 — Inbound + agent loop

## Goal

PF respondeu no WebMotors → nosso sistema detecta → Claude gera resposta contextual → enfileira → sender envia. Loop contínuo até convergência (PF aceita preço-alvo), recusa (PF diz não), ou escalation (Claude precisa info que não tem).

## Scope

### 11.1 — Receiver actor (Apify)

Custom Playwright actor rodando a cada **5-10 min**:
- Input: `{ bot_account_id }`
- Login reused
- Navega "Minhas mensagens" / "Anúncios > Perguntas"
- Scrapa threads ativas (unread + recentemente atualizadas)
- Pra cada thread: extrai URL estável + lista de mensagens com timestamps + senders
- Diff contra `agent_threads.last_pf_message_at`
- Retorna lista de new inbound messages

### 11.2 — Ingestion

Edge Function `process-inbound`:
- Roda após receiver completa
- Insere novas `agent_messages` (direction='inbound')
- Dedup via `webmotors_message_id`
- Atualiza `agent_threads.last_pf_message_at`, `status = 'awaiting_agent_response'`
- Triggers `compose-reply` pra cada novo inbound

### 11.3 — Reply composer

Edge Function `compose-reply`:
- Input: `thread_id`
- Loads full context:
  - opportunity + listing + wishlist
  - FIPE + computed savings target
  - Full `agent_messages` thread history
  - Negotiation state (round, current_offer, target_price)
- Calls Claude Sonnet 4.6 com system prompt v2 (extensão do v1 de Phase 1)
- Parses response pra extrair:
  - Message body (vai pro outbox)
  - Intent flag: `ongoing | converged | lost | escalated`
  - Updated `current_offer` se mudou
- Atualiza `thread.status`, insere em `pending_outbox`

### 11.4 — System prompt v2 (negotiation)

Evolui o prompt de Phase 1 (`src/lib/prompts/system-v1.ts`) com:

**Hard rules (guardrails):**
- NUNCA revele que é automatizado ou que trabalha pra AutoAgente
- NUNCA passe contato direto (telefone, email, WhatsApp)
- NUNCA peça contato direto antes de fechar
- NUNCA ofereça abaixo do hard floor: `fipe * (1 - max_discount)` (max_discount=0.30)
- NUNCA discuta docs/inspeção até PF concordar com preço

**Soft goals:**
- Abaixo de FIPE 20-25% é o sweet spot; 30% é teto
- Abordagem: validar interesse → pedir detalhes técnicos → oferecer um pouco abaixo do pedido → contrapropor
- Max 8 rounds antes de desistir

**Response format (structured):**
```
<intent>ongoing|converged|lost|escalated</intent>
<offer>85000</offer>              <!-- current offer, se proposta/contraproposta -->
<message>texto pro PF</message>
<rationale>por que esse movimento</rationale>  <!-- só pra log, não vai pro PF -->
```

Parse server-side com regex/xml; se parsing falha, retry uma vez e depois escalate.

### 11.5 — Escalation rules

Claude marca `intent=escalated` quando:
- PF pede documento específico que não temos (CRLV, IPVA, laudo pré-existente, histórico Carfax)
- PF pede info técnica que não está no scrape (manutenção detalhada, acidentes prévios)
- PF faz pergunta pessoal ("onde você mora?", "qual seu nome completo?", "me manda foto") — modo de burlar anti-bot
- PF insiste em contato direto antes de fechar preço
- Claude detecta inconsistência no anúncio que precisa confirmação humana

Thread vai pra `escalated`, opportunity.status=`escalated`, lojista notificado, thread aguarda input humano (Phase 12 permite lojista dar resposta via UI → enfileira como outbound).

### 11.6 — Convergence detection

Claude marca `intent=converged` quando:
- PF aceita preço-alvo explicitamente ("fechado", "ok", "pode ser", "combinado")
- Conversa discute próximos passos (encontro, pagamento, documentos)

Ao convergir:
- thread.status = 'converged'
- opportunity.status = 'converged'
- Lojista vê "Assumir Deal" no dashboard
- Agent loop **para** — não responde mais até lojista assumir
- Contato do PF fica oculto até fee pago (Phase 13)

### 11.7 — Loss detection

Claude marca `intent=lost` quando:
- PF recusa preço explicitamente e não negocia mais
- PF some (7 dias sem resposta) — cron job auto-marks
- PF pede SAIR (LGPD)
- Max rounds atingido sem acordo

Thread vira `lost`, opportunity arquivada.

### 11.8 — Monitoring

- `/admin/threads` view: active threads sorted by last activity
- Alert: thread round > 6 sem convergence → review manually
- Alert: Claude parsing failure rate > 5% → prompt ajustar

## Key questions

1. Frequency of receiver actor: 5min é caro (cada run tem cost fixo), 15min é lento pra PF sentir responsivo. Start com 10min, ajustar.
2. Reply latency target: Claude composes em ~5-20s, outbox delay random 30s-10min. Total: responde em 1-15min. Ok.
3. "Autonomous convergence" risk: agente aceita preço ruim por mal-entendido. Mitigation: hard floor enforcado no parsing, não no prompt apenas.

## Dependencies

- Phase 10 (sender + outbox)
- Claude prompt v1 existing

## Success criteria

- [ ] Receiver detecta novas mensagens reais em <15min
- [ ] Reply composer gera respostas contextuais coerentes
- [ ] Convergence flag corretamente detectado em testes com prompts mock
- [ ] Escalation flag triggered em casos esperados
- [ ] 1 conversa real de teste chega a `converged` com preço abaixo de FIPE
- [ ] Hard floor nunca violado (testar adversarial)

## Plans

TBD.
