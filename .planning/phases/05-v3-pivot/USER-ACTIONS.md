# User Actions — precisam ser feitas em paralelo ao código

Todas independentes e podem ser feitas agora enquanto eu trabalho no shell. Nenhuma bloqueia minha execução imediatamente, mas todas são pré-requisitos para o deploy final de sexta.

---

## 1. DNS — conectar autoagente.ai ao Vercel (2-3 min)

**Passo a passo:**

1. Abra https://vercel.com → Projects → `auto-agent` (ou o nome do projeto deployado).
2. Settings → Domains → **Add Domain**.
3. Digite `autoagente.ai` → Add.
4. O Vercel vai te mostrar os registros DNS necessários. Provavelmente vão ser:
   - **A record** em `@` → `76.76.21.21`
   - **CNAME** em `www` → `cname.vercel-dns.com`
5. Acesse o painel do registrar onde você comprou o domínio (Registro.br, GoDaddy, Namecheap, etc.) e adicione EXATAMENTE esses registros.
6. Propagação costuma ser rápida (~5-15 min) em TLD `.ai`.
7. Quando propagar, Vercel vai marcar o domínio como "Valid Configuration" e emitir o cert SSL automaticamente.

**Me avisa quando:** o domínio estiver "Valid Configuration" no Vercel — aí eu adiciono os env vars e rewrite do Next.js se necessário.

**Fallback se travar:** se o registrar não deixar um A record no apex (raro no `.ai`), use CNAME flattening ou ALIAS para `cname.vercel-dns.com`. Vercel documenta em https://vercel.com/docs/domains/working-with-domains/add-a-domain.

---

## 2. Apify — criar conta + pegar API token (5 min)

**Passo a passo:**

1. https://apify.com → Sign up (pode usar Google/GitHub).
2. Plano gratuito (Free tier): US$ 5 de crédito inicial, o suficiente pra rodar umas 100-500 chamadas de scraping single-URL. Mais que o bastante pro demo.
3. Após login → https://console.apify.com/account/integrations → copie o **Personal API token** (começa com `apify_api_`).
4. Me manda esse token aqui — eu adiciono como env var no Vercel Production + Preview + no `.env.local` local.

**Actor que vou usar:** `jupri/webmotors-br-scraper` OU actor próprio minimal via Cheerio se o actor público não servir bem (decido na hora da integração). Custo típico: US$0.02-0.05 por URL.

**Se você não quiser criar conta Apify:** fallback viável é scraping caseiro via `fetch` + Cheerio (open-source) rodando na rota Next.js. Mais frágil (WebMotors muda CSS às vezes) mas zero custo e zero vendor lock. Me diz se prefere essa via.

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

## Status (atualizado conforme avançamos)

- [x] FIPE autofetch — fix deployado 2026-04-21 (commit `75b3177`). Testa daqui a ~2min na URL atual.
- [x] Pivot documentado (CLAUDE.md, PROJECT.md, STATE.md, Phase 5 plan)
- [ ] Wave 0 shell — em execução (subagent worktree)
- [ ] Wave 1 módulos (Marketplace, Dashboard, MyDeals, Settings, Radar)
- [ ] Wave 2 Backstage + Apify
- [ ] Wave 3 Polish + deploy autoagente.ai
- [ ] User: DNS autoagente.ai no Vercel
- [ ] User: Apify API token

---

**Prioridade das actions:** DNS (1) > Apify (2) > DO (3).
