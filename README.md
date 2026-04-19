# AutoAgent Negotiation Playground

Ferramenta técnica de validação — chat manual funcional (Fase 1).

## Dev

1. `cp .env.local.example .env.local` e preencha `ANTHROPIC_API_KEY`.
2. `pnpm install`
3. `pnpm dev` → http://localhost:3000

## Scripts

- `pnpm dev` — Next.js dev server
- `pnpm build` — production build
- `pnpm start` — serve production build
- `pnpm lint` — Biome check
- `pnpm format` — Biome format (write)
- `pnpm test` — Vitest run once
- `pnpm typecheck` — tsc --noEmit

Deploy e variáveis de ambiente Vercel: ver PLAN 01-08.
