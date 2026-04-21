---
phase: 05-v3-pivot
status: executing
started: 2026-04-21
deadline: 2026-04-24
pivot_from: Phase 1 playground → v3 product shell
source_specs:
  - C:\Users\pc\Downloads\projeto autoagent atualizado\PRD_AutoAgent_v3.md
  - C:\Users\pc\Downloads\projeto autoagent atualizado\AutoAgent_UX_Prototype_v3.jsx
---

# Phase 5 — v3 Product Shell (pivot)

## Goal

Entregar um shell completo do produto AutoAgent v3 (dashboard lojista com 7 módulos) pronto para demo com Felipe em sexta 2026-04-24, reaproveitando 100% do núcleo de negociação da Phase 1 como módulo Backstage, com 1 pipeline real de scraping (Apify, on-demand por URL) e deploy em autoagente.ai.

## Non-Goals (confirmados com usuário em 2026-04-21)

- WhatsApp Business API real — aprovação Meta leva 1-4 semanas
- Pagamento real (Stripe/Mercado Pago) — compliance/webhooks = dias
- Auth multi-tenant + DB Postgres — localStorage single-tenant suficiente para demo
- Scraping contínuo 30k anúncios/mês — só on-demand por URL
- Exclusividade digital legal (Clicksign/D4Sign) — PDF mock baixável
- Módulo Admin completo — versão mínima (KPIs internos, disputas mockadas)

## Arquitetura

**Rota única:** `/app` renderiza `<AppShell>` client component com sidebar. Estado do módulo ativo em Zustand (`useAppStore`). Cada módulo é um componente em `src/components/v3/modules/`.

```
src/
├─ app/
│  ├─ page.tsx              # landing → redirect para /app
│  ├─ app/
│  │  ├─ layout.tsx         # sidebar + theme
│  │  └─ page.tsx           # <AppShell />
│  ├─ api/
│  │  ├─ fipe/              # (existente, fix aplicado)
│  │  ├─ negotiate/stream/  # (existente)
│  │  └─ scrape/
│  │     └─ webmotors/      # NOVO: Apify integration
├─ components/
│  ├─ negotiation/          # (existente, preservado — vira child do Backstage)
│  ├─ ui/                   # (existente shadcn)
│  └─ v3/                   # NOVO
│     ├─ AppShell.tsx
│     ├─ Sidebar.tsx
│     ├─ modules/
│     │  ├─ MarketplaceModule.tsx
│     │  ├─ MyDealsModule.tsx
│     │  ├─ BackstageModule.tsx
│     │  ├─ DashboardModule.tsx
│     │  ├─ RadarModule.tsx
│     │  ├─ SettingsModule.tsx
│     │  ├─ AdminModule.tsx
│     │  └─ OnboardingModule.tsx
│     └─ ui/
│        ├─ Badge.tsx
│        ├─ KPICard.tsx
│        ├─ ScoreRing.tsx
│        ├─ DealStatusBadge.tsx
│        ├─ SourceBadge.tsx
│        └─ TrustPanel.tsx
├─ lib/
│  ├─ mock-data/v3.ts       # NOVO: opportunities, deals, negotiations, chat histories
│  └─ store/
│     ├─ negotiation.ts     # (existente)
│     └─ app.ts             # NOVO: activeModule, currentPlan, opportunities, deals
```

## Plans (8 — execução em 3 dias, wave-parallelized onde possível)

### Wave 0 — Fundação (hoje, 21/04 restante)

- [ ] **05-01-PLAN** — Mock data extraction + Zustand app store + AppShell skeleton + Sidebar + routing
  - Files: `src/lib/mock-data/v3.ts`, `src/lib/store/app.ts`, `src/components/v3/AppShell.tsx`, `src/components/v3/Sidebar.tsx`, `src/app/app/layout.tsx`, `src/app/app/page.tsx`
  - Deliverable: abrir `/app` mostra sidebar + área vazia por módulo + navegação entre módulos funciona (placeholder "Module X coming" em cada um)

- [ ] **05-02-PLAN** — Utility components (Badge, KPICard, ScoreRing, ProgressBar, DealStatusBadge, SourceBadge, TrustPanel, ChatHistoryView)
  - Files: `src/components/v3/ui/*.tsx`
  - Deliverable: todos os componentes utilitários do prototype portados com props tipadas; Storybook-style manual check via rota temporária `/app/playground-v3`

### Wave 1 — Módulos visíveis (amanhã, 22/04 manhã)

- [ ] **05-03-PLAN** — Marketplace module (lista + detail drawer + filter + "Assumir Deal" modal)
- [ ] **05-04-PLAN** — Dashboard module (KPI cards + tier selector + gráficos recharts)
- [ ] **05-05-PLAN** — Meus Deals + Settings/Plans + Radar modules

### Wave 2 — Integração + scraping (22/04 tarde + 23/04 manhã)

- [ ] **05-06-PLAN** — Backstage module com ChatView embutido
  - Clicar em oportunidade no Marketplace → abre Backstage com anúncio pré-populado → chat live contra Claude Sonnet 4.6
  - Reaproveita 100% do ChatView/SummaryPanel/store da Phase 1
  - Acontece em paralelo com a lista de oportunidades "ao vivo"

- [ ] **05-07-PLAN** — Apify integration
  - `/api/scrape/webmotors` → actor Apify → retorna {marca, modelo, ano, km, preço, cidade, fipe}
  - UI no Radar: "Importar anúncio por URL"
  - UI no Marketplace: botão "+ Nova oportunidade" → cola URL → scrape → cria em localStorage

### Wave 3 — Polish + deploy (23/04 tarde)

- [ ] **05-08-PLAN** — Onboarding + Admin mínimo + domain autoagente.ai no Vercel + DO staging (best-effort) + deploy final + smoke test

## Corte de scope (se apertar)

Ordem de descarte (primeiro o menos crítico):
1. Admin module (Felipe não é ops interno)
2. DO staging (mantém Vercel como único target)
3. Onboarding multi-step (vira 1 tela de boas-vindas)
4. Radar auto-serviço (lista de modelos priorizados)
5. Seed inicial de scrape (só mantém "importar por URL manual")

## Núcleo inegociável

Marketplace + Backstage (chat live) + Dashboard + Meus Deals + Settings/Plans + Apify import por URL + FIPE funcionando + deploy em autoagente.ai com Vercel.

## Deploy

- **Primário:** Vercel project existente (`auto-agent-chi.vercel.app`). Conectar autoagente.ai como custom domain. DNS:
  - Apex `autoagente.ai` → A record `76.76.21.21`
  - `www.autoagente.ai` → CNAME `cname.vercel-dns.com`
  - User configura DNS no registrar onde comprou o domínio
- **Secundário (best-effort quinta):** DO App Platform conectado ao mesmo repo, branch separada. Se rodar verde, vira `staging.autoagente.ai` ou substitui Vercel.

## Testes

- Mantém suite Vitest existente (FIPE, negociação, FIPE autofetch fix)
- Novos módulos: smoke tests mínimos (render + click dos principais CTAs)
- Não adicionar Playwright/E2E (corta scope)

## Integration com Phase 1

- Phase 1 fica "executando" em STATE.md mas bloqueada por este pivô. Plans 02-00..02-06 (Phase 2 planejados) ficam deferred — a inteligência do agente será incorporada depois que o shell v3 estabilizar.
- Plano 01-08 (deploy + smoke test) fica parcialmente completo: Task 1 ✅ commitada, Task 2 ✅ deploy feito, Task 3 pendente mas superseded pelo demo Felipe sexta.
