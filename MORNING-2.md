# Bom dia — noite 2026-04-22 → madrugada 2026-04-23

Tu voltou ~23h de uma conversa estressante com o pai. Ele disse pra focar em backend/DB/auth/access-control/billing/contratos/scraping ANTES de qualquer trabalho no agente de negociação. Obedecemos.

Commit principal: `d48194a` — **docs(planning): pivot 3 — foundation-first, agent deferred**.

---

## O que rolou enquanto dormias (chronologically)

### 1. Pesquisa de escala/segurança Supabase ✅

Agente autônomo pesquisou fontes oficiais. Verdict: **fica no Supabase**. Não chega perto de problema de escala nos próximos 18 meses. Relatório completo em `.planning/research/supabase-scale-2026-04-22.md`.

**Pitch que você pode usar com teu pai:**

> "Mesma tech Postgres que bancos usam, SOC2 + ISO27001 auditado, hostado em São Paulo (LGPD-friendly). Stripe cuida dos cartões, então nossa exposição PCI é o tier de self-assessment trivial. $25/mês hoje, talvez $150/mês com 50 lojistas, $600/mês com 200+. Sem lock-in — é Postgres puro, se precisar migra pra AWS RDS em um fim de semana. Qualquer alternativa ou força reescrita ou adiciona 2-4 semanas de engineering."

**Timeline de upgrade:**
- Agora: Free tier ✅
- Primeiro lojista pagante: Pro $25/mês
- Antes de dinheiro real fluir: +PITR add-on (~$100/mês) para backup point-in-time
- 50+ lojistas: Team $599/mês pra SOC2 reports + SSO + read replicas

**Operational gotcha:** Vercel Edge abre/fecha connections agressivamente. Usar Supavisor transaction mode (port 6543, `pgbouncer=true`). Cliente JS do Supabase (PostgREST) já insula isso automaticamente. Só cuida se começar a usar connection direta.

### 2. Audit do estado real do Phase 6 ✅

Agente autônomo mapeou o que tá pronto vs scaffold:

- ✅ Clients Supabase reais (ativam quando env presente)
- ✅ Middleware com lógica de protection (no-op quando Supabase não configurado)
- ✅ Types `database.ts` alinhado com schema
- ❌ **`/login`, `/signup`, `/auth/callback` NÃO EXISTEM**
- ❌ **Hooks `useWishlists`, `useOpportunities`, `useDeals` NÃO EXISTEM**
- ❌ SignupView ainda é fake persona-picker Zustand
- ❌ Stores ainda localStorage-persisted

Estimativa pra fechar: 1.5-2 dias solo dev. Agente autônomo (abaixo) tá tentando fazer isso enquanto você dorme.

### 3. Extração de requisitos PRD v3 ✅

Agente autônomo leu PRD v3 + Business Plan. Descobertas chave:

- **Pricing matrix é precisa:** Starter R$197/6% / Premium R$499/3% / Enterprise R$1997/2%
- **Quotas DD:** 10/50/∞ por mês por tier
- **Pagamento:** PRD diz "Stripe ou similar" + Asaas pra escrow (BCB-regulated)
- **Contratos:** PRD v3 especifica **DocuSign** (não ZapSign). Mas ZapSign é BR-native e ~60% mais barato. Recomendação: começa ZapSign pro MVP, migra pra DocuSign se cliente Enterprise exigir.
- **Auth:** PRD NÃO especifica mecanismo de auth/MFA. Decidimos: magic-link + Google OAuth (Phase 6).
- **LGPD/KYC:** PRD NÃO cobre. Gap crítico — precisa publicar `/privacidade` e `/termos` antes de qualquer cobrança.
- **Volume scraping:** PRD diz **30.000 anúncios screenados/mês**. Apify ~$300-500/mês pra esse volume.

### 4. Reorganização do GSD ✅

Commit `d48194a`. Resumo:

**Fases ativas (nova ordem):** 6 → 7 + 8 (paralelo) → 9 → 13a → 13b → 12

**Fases deferred:**
- Phase 10 (Outreach sender) — espera algoritmo em papel com pai
- Phase 11 (Agent loop) — espera algoritmo em papel com pai
- Phase 13c (Escrow) — depende de deals fechados via agente

**Fases novas (split do Phase 13 monolítico):**
- **13a — Billing + access control + Stripe** (`.planning/phases/13a-billing-access-control/13a-PHASE-SEED.md`)
- **13b — Digital contracts** (`.planning/phases/13b-digital-contracts/13b-PHASE-SEED.md`)

**Phase 12 reframed:** antes era "lojista vê threads do agente realtime". Agora é "modo contato manual": lojista vê oportunidades, paga fee pra revelar contato PF, contata sozinho via WhatsApp. Sem agente negociando. Quando Phase 10/11 acordar, adicionamos a camada de thread realtime por cima.

### 5. Agente de execução Phase 6 em background 🚀

Lancei um agente autônomo pra completar Phase 6 enquanto dormes. Escopo:

1. Auth routes (`/login`, `/signup`, `/auth/callback`) com magic-link + Google OAuth
2. Hooks Supabase (`useWishlists`, `useOpportunities`, `useDeals`) com React Query + realtime
3. SignupView → `/app/onboarding` (persona picker vira pós-auth)
4. Seed script (`pnpm seed` idempotente)
5. Endpoint `/api/scrape/webmotors/webhook` conectando matching engine ao ingest

Cada task commita atomicamente com biome + typecheck + vitest verdes. Se algo falhar, ele documenta em `.planning/phases/06-supabase-integration/VERIFICATION.md`.

Quando acordar, rode:
```bash
git log --oneline -10
cat .planning/phases/06-supabase-integration/VERIFICATION.md
pnpm dev
# abre localhost:3000/login e testa fluxo
```

**Se laptop dormiu durante a noite:** o agente pausou no último commit. Fluxo limpo — só continua do próximo task não feito.

---

## O que VOCÊ precisa fazer (quando acordar, em ordem)

### Passo 1 — Revisar pivot 3 (5 min)
- Leia `.planning/PIVOT-3.md`
- Confirma se a direção tá certa: foundation-first, agente deferred até algoritmo em papel
- Se não tá certo, me avisa e eu re-reorganizo

### Passo 2 — Decidir pricing canônico (BLOQUEIA Phase 13a)
Temos dois pricings em tensão:
- **PRD v3:** Starter R$197 / Premium R$499 / Enterprise R$1997 + fees 6%/3%/2%
- **Landing autoagente.ai (produção):** R$0 + 8% / R$1490 + 4% / R$5900 + 2.5%

Qual é o canônico? Até decidir, Phase 13a Checkout fica bloqueado (preciso dos price IDs pra criar produtos no Stripe).

### Passo 3 — Revisar execução Phase 6
- Lê `.planning/phases/06-supabase-integration/VERIFICATION.md`
- Roda `pnpm dev` + testa fluxo `/login` → magic-link → `/app/onboarding` → `/app`
- Se tudo verde: Phase 6 tá fechado ✅
- Se quebrou: me dá `/gsd-debug` e compartilha logs

### Passo 4 — Escolher próxima fase
Opções após Phase 6:
- **A) Phase 7 (Wishlist UI)** — UI contra DB real. 2-3 dias. Desbloqueia demo com lojista.
- **B) Phase 8 (Scraping hardening)** — Apify schedule + anti-bot + cost caps. 3-4 dias. Pra ter inventory real.
- **C) Phase 13a (Billing)** — Stripe subscriptions + plan gating. 4-5 dias. Desbloqueia cobrança.

Recomendo **Phase 7 primeiro** (menor, visual, prova o fluxo end-to-end). Depois **8 + 13a paralelo**.

### Passo 5 — Blockers externos (você cuida, paralelo ao dev)
- [ ] CNPJ AutoAgente (MEI ~24h ou LTDA ~1-2 sem) — pré-req Stripe BR + ZapSign + DocuSign
- [ ] Política de Privacidade + Termos em autoagente.ai/privacidade e /termos — pré-req Phase 13a live
- [ ] DPA Supabase: email support@supabase.com pedindo assinatura do DPA — LGPD coverage (grátis)
- [ ] Quarterly ASV scanner (Trustwave ou SecurityMetrics, ~$150/ano) — PCI SAQ-A requirement
- [ ] Algoritmo de negociação em papel com pai — desbloqueia Phase 10/11

---

## Como configurar overnight agents de verdade (pra próximas noites)

Hoje usei background agents que rodam enquanto o laptop está ligado. Se quiseres **trabalho continuando mesmo com laptop fechado**, temos opções:

### Opção A — `/schedule` skill (remote agents)
Claude Code tem um skill chamado `schedule` que cria "routines" — agentes que rodam **na nuvem da Anthropic**, sem depender do teu laptop. Fica ativo enquanto dormes, mesmo com laptop desligado.

Uso:
```
/schedule "Todo dia às 2h da manhã, rode /gsd-next e continue fase ativa"
```

Isso cria um agente remote que dispara 2am diariamente. Ele clona teu repo, executa, commita, pusha. Custo: ~tokens dos modelos + setup trivial.

**Limitação:** precisa repo público ou auth configurada. Fala comigo pra setup completo.

### Opção B — `/loop` skill (local recurring)
Roda o mesmo prompt em loop, intervalos configuráveis. Exemplo:
```
/loop 1h /gsd-next
```

Dispara `/gsd-next` toda 1h. Precisa Claude Code rodando localmente (laptop ligado).

### Opção C — `/gsd-autonomous` (one-shot cascade)
Roda todas as fases restantes na sequência, sem intervenção. Comita atomicamente. Se hits ambiguity, pergunta; senão segue.

Uso:
```
/gsd-autonomous
```

**Melhor pra execução desatendida** (tipo agora). Limitação: laptop precisa ficar ligado.

### Opção D — GitHub Actions cron
Setup GitHub Actions workflow que dispara um agent step via Anthropic API em horários. Rode em qualquer lugar, sem laptop. Custo: GitHub Actions minutes (grátis até limite) + Anthropic API.

### Minha recomendação pra você

1. **Curto prazo (essa semana):** deixa laptop ligado de noite, usa `/gsd-autonomous` antes de dormir. Simples, funciona.
2. **Médio prazo (próximas 2 semanas):** configura `/schedule` pra rotina 2am executando `/gsd-next`. Laptop pode dormir.
3. **Longo prazo (pós product-market-fit):** GitHub Actions CI/CD orquestrando Anthropic API workflows — integra com teu repo sem depender de Claude Code.

Me pede `/schedule setup` quando quiseres configurar Opção A.

---

## Status na hora que você leu isso

- Branch: `main`
- Último commit planejado por mim: `d48194a` (pivot 3 docs)
- Último commit esperado do agente: algo em torno de `feat(phase-6): auth routes` ou mais avançado
- Roadmap canônico: `.planning/ROADMAP.md`
- Contexto da nova direção: `.planning/PIVOT-3.md`
- Pesquisa Supabase: `.planning/research/supabase-scale-2026-04-22.md`

Rode `/gsd-progress` quando sentar — te dou o ponto atual.

---

Beijo, boa noite, bom dia. Descansa.

— Claude (Opus 4.7)
