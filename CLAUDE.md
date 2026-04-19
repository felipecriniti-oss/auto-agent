<!-- GSD:project-start source:PROJECT.md -->
## Project

**AutoAgent Negotiation Playground**

Uma ferramenta técnica de validação que simula negociações de compra de veículos seminovos via IA. Um agente Claude negocia com um vendedor pessoa física (humano ou simulado) a partir de dados de um anúncio real, tentando fechar 20–30% abaixo da FIPE em até 6 rodadas. Serve simultaneamente como prova técnica da viabilidade do núcleo do AutoAgent e como demo ao vivo para entrevistas de validação com lojistas.

**Core Value:** O agente consegue negociar com PFs reais de forma convincente e extrair 20–30% vs FIPE consistentemente — sem isso, o modelo de negócio do AutoAgent inteiro cai.

### Constraints

- **Stack:** Next.js 15 App Router + TypeScript strict + Tailwind v4 + shadcn/ui + pnpm + Biome + Zustand — não negociável (seção 10 do brief)
- **LLM:** Anthropic Claude Sonnet 4.6 exclusivamente — alinhamento com stack do projeto maior
- **Deploy:** Vercel — preview branches + production
- **Sem banco:** localStorage suficiente até v1; evitar introdução de DB
- **Sem auth:** nenhuma fase deste playground usa autenticação
- **Budget de batch:** cap de R$ 50 por rodada de batch (custo de API)
- **Performance:** carrega em <2s, streaming visível, latência percebida baixa no Brasil → Vercel Edge runtime
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
