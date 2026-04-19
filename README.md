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

## Deploy — Vercel (INFRA-02)

1. **Importar projeto:** https://vercel.com/new → importe este repositório. Aceitar os defaults do Next 15.
2. **Configurar env vars** (Settings → Environment Variables, para `Production` e `Preview`):
   - `ANTHROPIC_API_KEY` — copiar de https://console.anthropic.com/settings/keys
   - `ANTHROPIC_MODEL` — `claude-sonnet-4-6` (per PROJECT-BRIEF §10 LLM lock)
   - `NEGOTIATION_ENABLED` — `true` (mudar para `false` para desligar o endpoint sem redeploy)
3. **Deploy:** push na `main` → Production; abrir PR → Preview (automático via git integration).

### Kill switch (INFRA-03 / D-17)

Para desligar o endpoint `/api/negotiate/stream` sem deploy:
- Vercel Project → Settings → Environment Variables → `NEGOTIATION_ENABLED` = `false`
- O próximo request retornará 503; o frontend mostrará banner vermelho "Negociações temporariamente indisponíveis".
- Para religar: volte `NEGOTIATION_ENABLED` para `true`. Efeito é per-request — não precisa redeploy (Vercel propaga env changes quase instantaneamente).

### Rate limit (INFRA-03 / D-16)

- `/api/negotiate/stream`: 5 requests por IP por 60s
- `/api/fipe`: 20 requests por IP por 60s
- Bloqueio: 429 com header `Retry-After`. Frontend mostra toast sonner.

### Custos (Anthropic Sonnet 4.5)

Cada sessão de 6 rodadas custa ~$0.05–0.08 USD. Phase 1 demos < 20 sessões/dia = < $2 USD/dia.

## Performance

- Target < 2s primeiro render (ROADMAP success criterion #5).
- Edge runtime em `/api/negotiate/stream` e `/api/fipe` (menor latência streaming no Brasil).
- Bundle edge < 1MB (free tier) — confirmar no primeiro deploy.

## CI

GitHub Actions em `.github/workflows/ci.yml`. Roda em cada PR:
- `pnpm install --frozen-lockfile`
- `pnpm biome check src`
- `pnpm typecheck`
- `pnpm vitest run`
- `pnpm build`
