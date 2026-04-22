# Bom dia — o que eu fiz enquanto você dormia

**Sessão autônoma 2026-04-22, ~01:00–02:00 BRT.** Escopo: pivô 2 (produto real WebMotors-only, full-auto agent) do zero até scaffold executável.

Tudo commitado e empurrado em `main`. O app **continua rodando** na Vercel sem nada dependendo de ação sua — o novo código é gated por `isSupabaseConfigured()` que retorna `false` enquanto você não criar o projeto Supabase, e o middleware de auth vira no-op nesse caso.

---

## Commits da sessão (ordem cronológica)

```
c40d90b docs(planning): pivot 2 — WebMotors-only full-auto product roadmap
710c334 feat(phase-6): Supabase foundation scaffold + matching engine + outreach prompts
bd688f0 feat(v3): WishlistModule replaces URL-paste as primary Operação entry
```

## O que está pronto

### Planning (docs)
- `PROJECT.md` reescrito — pivô 2 documentado, roadmap 6→13, decisões travadas, riscos aceitos
- `ROADMAP.md` reestruturado — 8 fases ativas (6-13) com escopo detalhado, depends_on, estimativas, user-blockers paralelos
- `.planning/phases/06-supabase-integration/06-PHASE-SEED.md` expandido — agora cobre schema completo pros phases 7-13 (ship-once migration)
- `.planning/phases/07-13/` — um SEED.md por fase com goal, scope, open questions, success criteria

### Schema (pronto pra aplicar em Supabase)
- `supabase/migrations/0001_init.sql` — 13 tabelas + RLS + indexes + triggers + realtime publications + opportunities_enriched view + auto-create users row on auth signup
- `supabase/seed.sql` — 1 user + 3 wishlists + 5 listings + 4 opportunities pra dev

### Código
- `src/types/database.ts` — Database type interface (hand-rolled; será regerado via `supabase gen types` depois)
- `src/lib/supabase/{env,client,server}.ts` — browser + server (SSR cookie) + service-role clients
- `src/middleware.ts` — refresh session + route protection /app/* (no-op quando Supabase não configurado)
- `src/lib/matching/engine.ts` — matching engine pura, 23 testes passando (hard rules brand/model/year/km/price/region/PF-only + soft score savings/motivation)
- `src/lib/prompts/outreach/opener-v1.ts` — prompt de primeira mensagem (guardrails: não revela FIPE/AutoAgente, sem oferta inicial, 3 linhas max)
- `src/lib/prompts/outreach/reply-v1.ts` — prompt de negociação com structured output (intent+offer+message+rationale), parser + hard-floor validator, 12 testes
- `src/lib/outreach/{types,negotiation-params}.ts` — shapes pro sender/receiver + cálculo de target/hard_floor a partir de FIPE
- `src/components/v3/modules/WishlistModule.tsx` — UI completa do fluxo wishlist (grid + form drawer)
- Store `src/lib/stores/app.ts` — wishlist CRUD local + persist v3 migration
- Sidebar + AppShell atualizados — "Wishlists" vira módulo default em `Operação`

### Dependências instaladas
- `@supabase/supabase-js`, `@supabase/ssr` (já no `package.json` / `pnpm-lock.yaml`)

### Saúde do build
- Biome ✓, typecheck ✓, vitest 241/241 ✓
- Root `/` e `/app` respondem 200 em dev local (testado antes do commit)
- Não quebrei nada do Phase 5 — Backstage, Autoplay, Marketplace URL-paste, dark mode, tudo intacto

---

## O que você precisa fazer ao acordar — checklist em ordem

### Passo 1 — Criar projeto Supabase (~10 min)

1. Ir em https://app.supabase.com → **New Project**
2. Nome: `autoagente-prod` (ou `autoagente-dev` se preferir separar)
3. Região: **sa-east-1 (São Paulo)** se disponível; senão **us-east-1**
4. Password forte pro Postgres (salva no password manager)
5. Tier: Free pra começar; fazer upgrade pra Pro ($25/mês) só quando usar em produção real

**Após criação** (~2 min provisionando):
- Copiar da dashboard → **Settings → API**:
  - `Project URL` → vai em `NEXT_PUBLIC_SUPABASE_URL`
  - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `service_role` key (⚠️ secret!) → `SUPABASE_SERVICE_ROLE_KEY`

### Passo 2 — Adicionar env vars

**Local (`.env.local`)**, adicionar no final:
```
NEXT_PUBLIC_SUPABASE_URL=https://SEU-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Vercel** (https://vercel.com → projeto `auto-agent` → Settings → Environment Variables): adicionar as 3 mesmas vars em **Production** e **Preview**. Redeploy automático depois.

### Passo 3 — Aplicar migrations

Opções (pelo simples):

**Via Supabase dashboard (recomendado pra começar):**
1. Dashboard → **SQL Editor**
2. New query → colar o conteúdo de `supabase/migrations/0001_init.sql`
3. Run → deve mostrar "Success. No rows returned"
4. Verificar em **Table Editor**: devem aparecer as 13 tabelas + `opportunities_enriched` view

**Via Supabase CLI (mais escalável, faça depois):**
```bash
pnpm add -D supabase
pnpm exec supabase link --project-ref SEU-REF
pnpm exec supabase db push
```
Isso vai aplicar tudo em `supabase/migrations/`.

### Passo 4 — Criar dev user + seed

1. Dashboard → **Authentication → Users** → **Add user**
2. Email: `dev@autoagente.local` + senha qualquer
3. **Email Confirm** ✓ (não manda magic-link)
4. Voltar no SQL Editor → colar `supabase/seed.sql` → Run
5. Deve ver em logs: `NOTICE: Seed complete for user <uuid>`

### Passo 5 — Testar localmente

```bash
pnpm dev
```

Ir em `http://localhost:3000` → deve estar tudo como antes (SignupView gate). Uma próxima phase 6 tarefa é plugar a auth Supabase na SignupView, mas ainda não fiz isso — por ora o fluxo fake-signup continua funcionando.

Pra testar que a conexão Supabase tá de pé:
```bash
# abre um terminal separado
pnpm exec tsx -e "
import { getSupabaseServiceRole } from './src/lib/supabase/server.js';
const sb = getSupabaseServiceRole();
const { data, error } = await sb.from('listings').select('id,brand,model').limit(3);
console.log(error ?? data);
"
```
Deve listar 3 das 5 listings do seed.

### Passo 6 — Contas bot WebMotors (pode começar enquanto eu codo)

Criar 5 contas gratuitas no WebMotors com emails:
- `leads.sp+01@autoagente.ai`
- `leads.sp+02@autoagente.ai`
- ... até `+05`

(O `+alias` do Gmail-style funciona nos emails do domínio autoagente.ai se você configurou catch-all. Se não, vai precisar de emails individuais.)

Cada conta precisa:
- Email confirmado
- Celular validado via SMS (usa uma vez)
- Preencher nome + cidade + opcionalmente foto "real" (não selfie, foto genérica serve)

**NÃO** envie mensagens ainda; deixa as contas ficarem "aged" por dias antes de começarem a mandar forms.

Quando tiver 5 prontas, me passa as credenciais (email + senha) em secure channel pra eu inserir em `bot_accounts` via service-role. Eu vou criptografar com `pgsodium` (Supabase Vault) antes de persistir.

### Passo 7 — CNPJ AutoAgente (paralelo, semana que vem)

Pré-req pra Meta Business API + Stripe BR + ZapSign:
- Abrir MEI ou LTDA online (https://www.gov.br/empresas-e-negocios)
- MEI é mais rápido (~24h), mas tem limite de faturamento R$81k/ano
- LTDA é melhor pro futuro (~1-2 semanas, precisa contador)

Enquanto não tem: foco em Phases 6-11 (nada de pagamento), desbloqueia 12-13 quando chegar.

### Passo 8 — Processo Meta Business (paralelo, começa depois que tiver CNPJ)

- Facebook Business Manager → Business Settings → WhatsApp Business Accounts → Create
- Precisa domínio verificado (já tem `autoagente.ai`) + CNPJ + verificação de negócio
- Leva 1-4 semanas pra aprovação; começar cedo

---

## Próximos passos de dev (quando retomar)

**Phase 6 — terminar Supabase integration** (3-5 dias):
1. Criar `/login`, `/signup`, `/auth/callback` pages com Supabase Auth UI
2. Escrever `useWishlists()`, `useOpportunities()`, `useDeals()` hooks contra Supabase (substituindo estado Zustand persistido). Preservar API dos hooks existentes.
3. Swap SignupView → fluxo real de magic-link (mantém persona picker como onboarding step após login)
4. Route protection via middleware (já tenho a shell — ativa quando env existe)
5. Seed script via `pnpm seed` pra dev convenience

**Phase 7 — Wishlist UI contra DB** (1-2 dias):
- Já tenho UI ✓. Só trocar `useAppStore.wishlists` → `useWishlists()` Supabase hook.
- Adicionar onboarding wizard pós-signup: "crie sua primeira wishlist".

**Phase 8 — Scraping pipeline** (3-4 dias):
- Apify scheduled run WebMotors (CRON no dashboard Apify)
- Endpoint `/api/scrape/webmotors/ingest` recebe webhook → upsert listings
- Normalização + dedup + FIPE enrichment

**Phase 9 — Matching engine (plug in DB)** (1-2 dias):
- Já tenho a pure function ✓. Só chamar no ingest handler após upsert.
- Criar opportunities automaticamente quando score ≥ 0.7.

**Phase 10 — Outreach sender** (4-5 dias):
- Custom Apify actor em Playwright (escrever do zero; não tem ator público que submete forms)
- Pool rotation de bot_accounts
- Outbox worker via pg_cron + Edge Function
- Integrar prompt `opener-v1` no composer

**Phase 11 — Receiver + agent loop** (4-5 dias):
- Segundo Apify actor (polling inbox)
- Agent loop usando `reply-v1` prompt
- Hard floor enforcement no parser (já tenho `offerRespectsHardFloor`)

Se você conseguir os blockers acima até amanhã, dá pra começar a execução real da Phase 6 com GSD logo. Eu vou precisar de uns 2-3 dias corridos pra entregar Phase 6 funcional.

---

## Observações / riscos a pensar

1. **Custo Apify vai crescer rápido.** Começar com 1 run/dia de top 20 modelos pra acumular inventory antes de ligar pra todo lojista. Cost alert no dashboard com cap de $50/dia na primeira semana.

2. **WebMotors vai detectar padrões eventualmente.** Primeira conta bot que banir a gente aprende muito sobre o threshold. Começar com 5 contas, aceitar perder uma por mês.

3. **LGPD é real.** Preciso publicar `/privacidade` e `/termos` antes de Phase 10 ir vivo. Template Brasil-friendly — posso escrever.

4. **`opportunities_enriched` view não é realtime.** Se subscribir realtime em cima da view falha no Supabase. Solução: subscribe na tabela `opportunities` e fazer JOIN client-side. Já planejei nos hooks.

5. **Prompt engineering vai precisar iteração.** `opener-v1` e `reply-v1` são chutes educados. Primeiros 10-20 threads reais vão expor o que precisa ajustar — versionar como `opener-v2`, `reply-v2` em arquivos separados mantendo histórico.

6. **Quando Felipe ver o produto real:** a diferença entre o shell atual (URL-paste) e o produto pós-Phase 12 é enorme. Considera gravar video loom da demo quando Phase 12 cair pra recalibrar expectativas do mercado.

---

## Se algo estiver quebrado

Tudo deve estar funcionando. Checks que rodei antes de commitar:
- `pnpm typecheck` ✓
- `pnpm biome check src` ✓
- `pnpm vitest run` → 241/241 ✓
- `pnpm dev` → /, /app respondem 200 ✓

Se algo explodir: provavelmente é o `.env.local`. Verifica se as 3 vars Supabase estão lá. Se não estão, o middleware vira no-op e o app continua como pré-Phase-6 (intacto).

Se realmente encontrar bug, roda `/gsd-debug` e compartilha o VERIFICATION.md comigo.

---

Beijo, bons sonhos, bom dia. Quando sentar no computador me dá /progress e a gente continua Phase 6 execução. 🚀
