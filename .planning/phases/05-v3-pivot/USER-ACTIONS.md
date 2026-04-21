# User Actions — precisam ser feitas em paralelo ao código

Todas independentes e podem ser feitas agora enquanto eu trabalho no shell. Nenhuma bloqueia minha execução imediatamente, mas todas são pré-requisitos para o deploy final de sexta.

---

## 1. DNS — conectar `app.autoagente.ai` ao Vercel (2-3 min)

**Decisão (2026-04-21):** o apex `autoagente.ai` JÁ é a landing Astro de produção — não mexer. Dashboard do v3 vai em **subdomínio `app.autoagente.ai`**.

**Passo a passo:**

1. Painel do registrar onde você comprou o domínio → zona DNS de `autoagente.ai`.
2. Adicione 1 registro:
   - Tipo: **CNAME**
   - Nome/Host: `app`
   - Valor/Target: `cname.vercel-dns.com`
   - TTL: padrão (auto ou 3600)
3. https://vercel.com → Projects → `auto-agent` → Settings → Domains → **Add Domain** → digite `app.autoagente.ai` → Add.
4. Aguarde 5-15 min (TLD `.ai` propaga rápido). Vercel emite cert SSL automaticamente quando validar.
5. Quando "Valid Configuration" aparecer no Vercel, abra `https://app.autoagente.ai` → deve carregar o dashboard.

**Fallback caso registrar não aceite CNAME em subdomínio arbitrário** (raro): use ALIAS/ANAME em vez de CNAME, mesmo target.

**Fallback total** (caso DNS não propague a tempo): demo roda direto em `https://auto-agent-chi.vercel.app` — funcional, só não tão branded. Zero risco.

---

## 2. Apify — criar conta + pegar API token (5 min)

**Passo a passo:**

1. https://apify.com → Sign up (pode usar Google/GitHub).
2. Plano gratuito (Free tier): US$ 5 de crédito inicial, o suficiente pra rodar umas 100-500 chamadas de scraping single-URL. Mais que o bastante pro demo.
3. Após login → https://console.apify.com/account/integrations → copie o **Personal API token** (começa com `apify_api_`).
4. Me manda esse token aqui — eu adiciono como env var no Vercel Production + Preview + no `.env.local` local.

**Actor que vou usar:** `jupri/webmotors-br-scraper` OU actor próprio minimal via Cheerio se o actor público não servir bem (decido na hora da integração). Custo típico: US$0.02-0.05 por URL.

**Se você não quiser criar conta Apify:** fallback viável é scraping caseiro via `fetch` + Cheerio (open-source) rodando na rota Next.js. Mais frágil (WebMotors muda CSS às vezes) mas zero custo e zero vendor lock. Me diz se prefere essa via.

### Env var name — wire-up (confirmado 2026-04-21)

A rota `/api/scrape/webmotors` lê o token do env `APIFY_API_TOKEN` (exato, case-sensitive).

- **Local:** adicionar a linha `APIFY_API_TOKEN=apify_api_xxx` no `.env.local` do repo (já existe template em `.env.example` + `.env.local.example`). Sem o token o endpoint devolve 500 com `{ error: "apify_token_missing" }` — intencional.
- **Vercel:** Settings → Environment Variables → New → Key `APIFY_API_TOKEN`, Value `apify_api_xxx`. Marcar para **Production**, **Preview** e **Development** (os 3). Re-deploy da branch `main` após adicionar.
- **Actor primário:** `jupri~webmotors-br-scraper` (o endpoint faz fallback automático para `apify~web-scraper` com `pageFunction` inline se o actor primário não existir mais na conta).
- **Runtime:** `nodejs` (budget de 45s — scraping single-URL leva 10-30s em média).

---

## 3. DigitalOcean (opcional, staging) — só começar se sobrar tempo na quarta

**Passo a passo (quando fizer):**

1. https://cloud.digitalocean.com → Sign up (US$ 200 free credit por 60 dias se for primeira conta).
2. Apps → Create App → Connect GitHub → seleciona o repo `grunixx/auto-agent`.
3. Plano Basic $5/mês é suficiente para o demo. Build command auto-detectado (`pnpm build`). Run command `pnpm start`.
4. Env vars: adicionar ANTHROPIC_API_KEY, ANTHROPIC_MODEL, NEGOTIATION_ENABLED, APIFY_API_TOKEN (depois que tiver).
5. **Importante:** as routes `edge` do Next.js (nosso `/api/fipe` e `/api/negotiate/stream`) NÃO rodam em DO. Precisaremos converter para `nodejs` runtime antes de deploy. Eu faço isso na quinta.
6. Domínio `staging.autoagente.ai` apontado para DO (A record separado).

**Recomendação:** deixa isso para quinta (23/04). Se não der, o Vercel sozinho carrega o demo de sexta. Seu pai pode ver a migração acontecer na semana seguinte.

---

## Status (atualizado 2026-04-21 tarde)

### Concluído (código, testado, deployado na Vercel)

- [x] FIPE autofetch fix (`75b3177`)
- [x] Pivot documentado (CLAUDE.md, PROJECT.md, STATE.md, Phase 5 plan)
- [x] Wave 0 shell (AppShell + Sidebar + Zustand store + v3 UI primitives)
- [x] Wave 1 módulos (Marketplace + Dashboard + MyDeals + Settings + Radar)
- [x] Wave 2 Backstage solo chat + Apify on-demand por URL (ribtools scraper)
- [x] SignupView fake-auth gate com persona picker
- [x] Modo Piloto (drip-feed 5 opps teatral) + /api/simulate-pf endpoint
- [x] Backstage autoplay loop (agente ↔ PF sim, commit `04a60a8`)
- [x] ribtools scraper com todos os campos (location, fotos, PF/PJ, motivação, commit `ca90fe7`)
- [x] Dark mode via next-themes + ThemeToggle no Sidebar (commit `c8761df`)

### Pendente do código (Wave 3 final)

- [ ] Onboarding/primeiros passos pós-signup (polish)
- [ ] Mobile responsive QA pass
- [ ] End-to-end smoke test (clear localStorage → signup → Modo Piloto → click opp → autoplay → Assumir Deal)

### Pendente do usuário (bloqueio para demo de sexta)

- [x] **APIFY_API_TOKEN** no Vercel — confirmado 2026-04-21 pelo usuário
- [x] **ANTHROPIC_API_KEY** + **NEGOTIATION_ENABLED=true** no Vercel — confirmado 2026-04-21 pelo usuário
- [ ] **DNS `app.autoagente.ai` → Vercel** (subdomínio, não apex — apex está na landing Astro de produção). No painel do registrar adicione um **CNAME** em `app` apontando para `cname.vercel-dns.com`. No Vercel → Settings → Domains → Add `app.autoagente.ai`. Cert SSL é automático. **Sem isso o demo tem que rodar no URL `auto-agent-chi.vercel.app`** (fallback ok, só não tão bonito).

### Opcional (quinta-feira se sobrar tempo)

- [ ] DigitalOcean App Platform como staging.autoagente.ai
  (best-effort, Vercel sozinho cobre a demo)

---

**Prioridade das actions:** DNS (1) > Apify token (2) > DO (3).
