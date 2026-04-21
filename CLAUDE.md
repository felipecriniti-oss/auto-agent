<!-- GSD:project-start source:PROJECT.md -->
## Project

**AutoAgent — v3 Product Shell (pivot 2026-04-21)**

> **URGENT:** Repositório está em pivô para o produto v3 completo (PRD v3, 2026-04-18). Deadline: sexta 2026-04-24. Scope ativo em `.planning/phases/05-v3-pivot/05-PHASE-PLAN.md`. Especificações-fonte em `C:\Users\pc\Downloads\projeto autoagent atualizado\` (PRD + UX Prototype + Business Plan + Financial Model).

**O que AutoAgent é (v3):** marketplace transacional B2B para lojistas de seminovos. Lojistas pagam assinatura tier Starter/Premium/Enterprise (R$197/499/1997) + success fee (6%/3%/2% sobre economia vs FIPE). Agente IA monitora WebMotors/OLX/Mercado Livre, aborda PFs motivados via WhatsApp/formulário, negocia até -20/-30% da FIPE, oportunidade entra no Marketplace do dashboard, lojista "Assume Deal" e recebe contato + docs. AutoAgent intermedeia laudo/contrato/transferência/escrow.

**PF nunca é cliente.** Non-Goal NG4 explícito do PRD: "Atender vendedor PF como cliente B2C". PF é lead via WhatsApp. Qualquer UI/copy que sugira PF self-service está errada.

**Núcleo técnico reaproveitado:** todo o motor de negociação da Phase 1 (`/api/negotiate/stream`, Zustand store, ChatView, SummaryPanel, prompt system) vira o módulo **Backstage de Negociações** do dashboard. Nada do código Phase 1 se perde.

### Scope para sexta (deadline duro)

**Entra:**
- Dashboard lojista com 7 módulos (Marketplace, Meus Deals, Backstage, Dashboard KPI, Radar, Settings/Plans, Admin mínimo)
- Backstage embutindo o chat live do Phase 1 contra oportunidades mockadas
- Apify integrado: colar URL WebMotors → extrair dados → criar oportunidade
- FIPE autofetch funcionando (fix já deployado 2026-04-21)
- Deploy em autoagente.ai (Vercel primary, DO como secondary/staging)

**Não entra (bloqueadores duros — impossível em 3 dias):**
- WhatsApp Business real (aprovação Meta 1-4 semanas)
- Pagamento de fee real (Stripe/MP compliance = dias)
- Auth multi-tenant + DB Postgres (localStorage persiste)
- Scraping contínuo 30k/mês (só on-demand por URL)
- Exclusividade digital legal (PDF mock)

### Constraints (herdados da Phase 1, ainda válidos)

- **Stack:** Next.js 15 App Router + TypeScript strict + Tailwind v4 + shadcn/ui + pnpm + Biome + Zustand — não negociável
- **LLM:** Anthropic Claude Sonnet 4.6 exclusivamente
- **Deploy primário:** Vercel (autoagente.ai); DO App Platform como secondary/migração futura
- **Sem DB:** localStorage persiste state do lojista single-tenant
- **Sem auth:** single-tenant, "login" fake via select de persona
- **Scraping:** Apify on-demand (não Bright Data — overkill para o caso de uso atual)
- **Performance:** <2s primeiro render no Edge
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
