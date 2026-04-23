---
pivot: 3
created: 2026-04-22
decision_source: conversa com pai (usuário reportou 2026-04-22 noite)
supersedes: pivot 2 (2026-04-22) phase ordering
status: active
---

# Pivot 3 — Foundation-first, Algorithm-later (2026-04-22 noite)

## Direção nova (de boca do pai)

> "Foca em construir agora a parte do backend, da database, de cadastro de usuários, controle de acesso dos usuários (planos pagos), garantir o funcionamento do scraping para acessar as páginas do WebMotors, e também já ir preparando a plataforma para suportar plataformas de pagamento de contrato digital. Evite completamente trabalhar no agente e no sistema de enviar mensagem para as ofertas — primeiro temos que construir o algoritmo antes de você nos ajudar a construir."

## Tradução para roadmap

### Execução autorizada (construir agora)

1. **Phase 6 — Supabase foundation** (em andamento)
2. **Phase 7 — Wishlist UI contra DB real**
3. **Phase 8 — Scraping pipeline WebMotors + hardening**
4. **Phase 9 — Matching engine** (plug-in da pure function no DB)
5. **Phase 13a — Billing + plan gating + Stripe subscriptions** (decomposição executiva de Phase 13)
6. **Phase 13b — Contratos digitais DocuSign** (decomposição executiva de Phase 13, PRD-spec)

Phase 13a e 13b constroem infra. **Triggers reais** (fee on Assumir Deal, botão "gerar contrato exclusividade") ficam ocultos na UI até Phase 10/11/12 retornarem — PRD flow preservado.

### Deferido até algoritmo ser desenhado com pai

- **Phase 10 — Outreach sender** — DEFER até algoritmo de abordagem definido
- **Phase 11 — Inbound + agent loop** — DEFER até algoritmo de negociação definido
- **Phase 12 — Inbox dashboard (PRD spec integral)** — DEFER, depende de 10/11
- **Phase 13c — Escrow** — depende de agent deals → DEFER

### Correção 2026-04-22 noite (pós-discussão com pai)

**Phase 12 NÃO é reframed.** Mantém spec PRD v3 integral: "Inbox dashboard — lojista vê threads do agente em realtime, 'Assumir Deal' pós-convergência". Como Phase 12 depende de Phase 10/11 (que estão deferred), **Phase 12 também fica DEFERRED**. Não inventar caminho alternativo — pai pediu pra não mudar o plano dele.

**Não há "manual contact mode".** Produto vendável nessa iteração = subscription ativa + scraping rodando + matching criando opportunities + contratos infra pronta, aguardando agente retornar pra destravar o fluxo completo de "Assumir Deal".

## Nova sequência numérica

| Fase | Título | Status | Depende de |
|------|--------|--------|------------|
| 6 | Supabase foundation | 🔜 em execução | — |
| 7 | Wishlist UI | seeded | 6 |
| 8 | Scraping pipeline + hardening | seeded | 6 |
| 9 | Matching engine (DB integration) | seeded | 7, 8 |
| 10 | ~~Outreach sender~~ | ⏸️ **DEFERRED** (pending algorithm) | — |
| 11 | ~~Inbound + agent loop~~ | ⏸️ **DEFERRED** (pending algorithm) | — |
| 12 | Opportunities dashboard (manual contact mode) | seeded, reframe | 9, 13a |
| 13a | Billing + plan gating + Stripe subscriptions | **NEW (promoted)** | 6 |
| 13b | Digital contracts (ZapSign) | **NEW (promoted)** | 13a |
| 13c | ~~Escrow~~ | ⏸️ **DEFERRED** (needs closed deals) | — |

## Rationale

1. **Sem algoritmo de negociação definido, qualquer trabalho em Phase 10/11 é throwaway.** Pai tá certo: melhor parar o agente e construir infra vendável.
2. **Phase 13 foi "closing completo" monolítica** — agora split em (13a billing) + (13b contratos) + (13c escrow deferred) porque billing é pré-requisito pra qualquer venda (até sem agente) e contratos são valor agregado independente do agente.
3. **Phase 12 com agente era "lojista espia o agente negociar"**; sem agente vira "lojista vê o match e contata PF sozinho" — produto ainda é vendável, só sem o diferenciador full-auto.
4. **Phase 6-9 + 13a + 13b + 12** = produto B2B funcional, vendável, cobrança ativa, contratos gerados. Sem agente, sim — mas **é um produto real** em que lojista paga, recebe matches automatizados, entra em contato com PFs. Próxima iteração liga o agente.

## Pendências pro user (revisitar quando acordar)

1. Revisar essa pivot notice — OK ou ajustar?
2. Definir junto com pai o algoritmo de negociação em papel (Phase 10+11 readiness)
3. Decidir Supabase Pro ($25/mês) vs ficar no Free até ter primeiro lojista pagante
4. Confirmar: CNPJ AutoAgente em andamento? (Pré-req Stripe BR + ZapSign)

## Questões de segurança/escala (research em andamento)

Agentes rodando em background nessa sessão:
- **Supabase scale research** — aguenta 10k-100k requests/mês financial workload? Alternativas se não.
- **Phase 6 audit** — estado real da integração Supabase (scaffolding vs funcional)
- **PRD v3 requirements** — extração específica de requisitos auth/billing/payment/contracts

Resultados ficam em `.planning/research/` e informam planos finais de 13a + 13b.

---
*Locked 2026-04-22 noite — pivot autorizado por pai; superseda pivot 2 phase ordering.*
