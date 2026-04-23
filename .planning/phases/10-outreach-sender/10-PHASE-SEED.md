---
phase: 10-outreach-sender
status: DEFERRED
created: 2026-04-22
deferred_at: 2026-04-22
deferred_reason: pivot 3 — pai pediu para pausar trabalho no agente até algoritmo ser desenhado em papel; infra vendável (6-9, 13a, 13b, 12) primeiro
depends_on: [09-matching-engine, ALGORITHM-DESIGN-SESSION]
estimated_duration: 4-5 days
---

# Phase 10 — Outreach sender ⏸️ DEFERRED (2026-04-22)

> **PAUSE:** Pivot 3 (`.planning/PIVOT-3.md`) pausou todo trabalho de agente+outreach. Só retoma depois que algoritmo de abordagem for definido em papel com pai.
>
> Não tocar nesta fase até confirmação explícita do user. Requisitos abaixo preservados como referência.

---

## Goal

Oportunidade criada → agente compõe mensagem inicial via Claude → enfileira em `pending_outbox` → Apify sender actor loga em uma conta bot WebMotors, navega ao anúncio, e submete o form "Enviar mensagem". Isto é o ponto onde **o sistema passa a trabalhar autonomamente pelo lojista**.

## Scope

### 10.1 — Bot accounts provisioning

**Requisitos externos (USER):** criar 5-10 contas WebMotors com emails `leads.sp+01@autoagente.ai` … `+10@autoagente.ai`. Cada conta precisa:
- Email verificado
- Número SMS validado (SIM usado apenas uma vez)
- Perfil preenchido (nome, cidade, foto opcional)
- Histórico "natural" — alguns favoritos, scroll pela home

Seeding:
- Tabela `bot_accounts` inicialmente vazia
- Admin UI simples (ou SQL direto) pra inserir: email + senha encrypted via pgsodium
- Status inicial: `warming` com `max_daily_messages=5`, escalonando a cada semana até `25`

### 10.2 — Sender actor (Apify)

Custom Apify actor em Playwright:
- Input: `{ bot_account_id, listing_url, message_body }`
- Login (session reusada via cookie jar persistido em Apify KV store)
- Navega URL do anúncio
- Clica "Enviar mensagem" → aguarda modal
- Preenche textarea com `message_body`
- Submete
- Detecta confirmação ou captcha
- Retorna `{success: bool, thread_url?, error?}`

Retries: 3 tentativas com backoff; se todas falham → dead letter.

### 10.3 — Outbox worker

Edge Function `process-outbox` rodando a cada 2-3 min (via pg_cron + http request ou Vercel cron):
- SELECT de `pending_outbox` WHERE status='queued' AND scheduled_for <= now() ORDER BY scheduled_for LIMIT N
- Pra cada job: pick least-recently-used `bot_account` with `messages_sent_today < max_daily_messages` and `status='active' OR 'warming'`
- Marca outbox row `status='sending'`
- Chama Apify sender actor
- On success: `status='sent'`, cria row em `agent_messages` (direction='outbound'), update thread.status, update bot_account.messages_sent_today
- On failure: increment attempts, reschedule com backoff, or dead-letter after 3 fails

### 10.4 — Throttling + anti-detection

- `messages_sent_today` resets daily via cron job
- Randomized delays: outbox `scheduled_for` = now() + random(30s, 15min) quando enfileira
- Randomized message phrasing: 3-5 template variations rotated per thread
- Business hours only: não enviar entre 22h-8h (mais natural)
- Jitter entre mensagens de uma mesma conta bot

### 10.5 — Opener message composer

Edge Function `compose-opener`:
- Input: `opportunity_id`
- Loads: listing + wishlist + fipe + motivation signals
- Calls Claude Sonnet 4.6 com system prompt de opener (versionado, testável)
- Output: message body
- Insere em `pending_outbox`

System prompt de opener (template inicial):

```
Você é um comprador interessado em um carro anunciado no WebMotors.
Sua tarefa: escrever uma mensagem CURTA (máx 3 linhas) pro vendedor.
Tom: casual, direto, brasileiro. Nem formal demais, nem íntimo demais.

Você viu o anúncio de {ano} {marca} {modelo} por {preço_formatado}.
FIPE está em {fipe_formatada}.
Sinais: {motivation_signals}.

Objetivo: abrir conversa e sinalizar interesse genuíno SEM fazer oferta ainda.
Pergunta 1 detalhe natural que faria um comprador real perguntar.

NUNCA mencione FIPE, economia, ou valores negociados.
NUNCA mencione AutoAgente ou que é automatizado.
NUNCA passe contato (nem telefone, nem email).

Responda APENAS com o texto da mensagem, sem comentários.
```

Exemplos esperados:
> "Opa, tudo bem? Vi teu Civic, bonito! Ele já passou revisão essa semana? Tô procurando algo assim aqui em SP."
> "E aí, boa tarde. Esse Corolla tá disponível ainda? Me fala como tá a lataria, se tem algum detalhe pra olhar."

### 10.6 — LGPD compliance baseline

- Policy page published at `/privacidade` (Phase 6 requirement, validate here)
- Every outbound message appended: "\n\n_Responda SAIR para não receber mais contatos._"
- Table `opt_out_list` with (phone_hash OR webmotors_user_id) → hard block from creating threads
- Detection: inbound message contains "SAIR" / "PARE" / "NAO QUERO" → add to opt_out, mark thread lost

### 10.7 — Admin monitoring

Simple `/admin/outreach` page:
- Table de bot_accounts + status + daily count
- Last 50 outbound messages (body + target listing + status)
- Dead-lettered jobs
- Scrape runs summary (from Phase 8)

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| Conta bot banida | Pool rotativo, warming, rate limits. Accept ~1/mo attrition. |
| WebMotors detecta captchas | Apify residential proxies; human-like timing; fingerprint rotation |
| Message marcada como spam no WebMotors | Variar phrasing; NÃO spam multiple listings do mesmo anunciante |
| Latência agent_loop vs PF já saiu | Outbox delay 30s-15min, response latency target <10min |

## Dependencies

- Phase 9 (opportunities existem)
- `ANTHROPIC_API_KEY` env (já tem)
- `APIFY_API_TOKEN` env (já tem)
- USER: criar bot accounts

## Success criteria

- [ ] Pool de 5 bot accounts ativas em warming
- [ ] Sender actor envia mensagem real de teste
- [ ] Opener composer gera mensagens convincentes
- [ ] Outbox worker processa queue sem intervenção
- [ ] Throttling respeitado (contadores diários funcionam)
- [ ] LGPD opt-out honrado em teste manual
- [ ] 10 mensagens reais enviadas em dev sem ban

## Plans

TBD.
