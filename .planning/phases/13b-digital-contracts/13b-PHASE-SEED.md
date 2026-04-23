---
phase: 13b-digital-contracts
status: seeded
created: 2026-04-22
promoted_from: 13-contracts-escrow-stripe (pivot 3 split)
depends_on: [13a-billing-access-control, 06-supabase-integration]
estimated_duration: 3-4 days
priority: high
---

# Phase 13b — Digital Contracts (DocuSign)

> **Promovido de Phase 13** em pivot 3. Separado porque contratos são valor agregado independente de agente.

## Goal

Infraestrutura pra gerar e assinar digitalmente:
1. **Exclusividade digital 7 dias** — PF se compromete a não vender pra outra pessoa enquanto AutoAgente fecha
2. **Compra e venda** — contrato final entre lojista e PF após fechamento

Assinatura via DocuSign embedded (spec do PRD v3) ou ZapSign como alternativa BR-native.

## Provider decision

**PRD v3 especifica:** DocuSign. Custo: ~R$ 25/contrato.

**Alternativas BR:**
- **ZapSign** — BR-native, API simples, ~R$ 5-15/envelope. Melhor UX mobile.
- **Clicksign** — BR, mais caro (~R$ 20), integrações enterprise.
- **DocuSign BR** — global, mais caro (~R$ 25-40), mais aceito em enterprise.

Recomendação: começar com **ZapSign** pra MVP (custo menor + UX BR melhor), migrar pra DocuSign só se cliente enterprise exigir. Confirmar com user.

## Scope

### 13b.1 — Template system

Diretório `docs/templates/`:
- `exclusivity-v1.html` — template HTML com handlebars vars
- `purchase-sale-v1.html` — contrato compra/venda completo
- Variables: `{{lojista_nome}}`, `{{pf_nome}}`, `{{pf_cpf}}`, `{{veiculo}}`, `{{preco_acordado}}`, `{{prazo_dias}}`, etc.

Render server-side via `src/lib/contracts/render.ts`:
- Input: template id + variables dict
- Output: PDF bytes (via `@react-pdf/renderer` ou headless browser fallback)
- PDFs persisted em Supabase Storage bucket `contracts/` (private, service-role write, RLS read por user owner)

### 13b.2 — DocuSign / ZapSign client

`src/lib/contracts/client.ts`:
- Abstract `ContractProvider` interface
- Implementation 1: `ZapSignProvider` (primary)
- Implementation 2: `DocuSignProvider` (fallback / enterprise)
- Selected via `CONTRACT_PROVIDER` env var

API:
```ts
interface ContractProvider {
  sendForSignature(input: {
    documentId: string,
    signers: Array<{ name, email, cpf?, phone? }>,
    metadata: Record<string,any>
  }): Promise<{ envelopeId: string, status: 'sent' }>

  fetchStatus(envelopeId: string): Promise<{
    status: 'sent'|'delivered'|'signed'|'declined'|'voided',
    signedUrl?: string,
    auditTrailUrl?: string
  }>
}
```

### 13b.3 — Tables (new migration 0003)

```sql
contract_templates (
  id text PRIMARY KEY,          -- 'exclusivity-v1', 'purchase-sale-v1'
  name text NOT NULL,
  version int NOT NULL,
  html_source text NOT NULL,    -- versioned
  variables jsonb NOT NULL,     -- schema of vars
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

contracts (
  id uuid PK,
  user_id uuid FK users,
  opportunity_id uuid FK opportunities,
  deal_id uuid FK deals,
  template_id text FK contract_templates,
  kind text CHECK IN ('exclusivity', 'purchase_sale'),
  pdf_url text,                  -- Supabase Storage URL
  provider text CHECK IN ('zapsign','docusign'),
  provider_envelope_id text,
  provider_status text,           -- mirrored from provider webhook
  signed_pdf_url text,             -- audit-trailed signed version
  signed_at timestamptz,
  expires_at timestamptz,          -- 7 dias pra exclusividade
  signers jsonb,                   -- [{name, email, role, signed_at?}]
  created_at, updated_at timestamptz
);

contract_events (
  id uuid PK,
  contract_id uuid FK contracts,
  event_type text,                 -- 'sent','viewed','signed','declined'
  actor_email text,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);
```

### 13b.4 — Endpoints

`POST /api/contracts/exclusivity`:
- Input: `{ opportunity_id }`
- Auth: user owns opportunity
- Loads PF data from opportunity + listing (depends on scraping pipeline getting PF phone)
- Renders template + creates contract row
- Sends via ZapSign
- Returns envelope_id

`POST /api/contracts/purchase-sale`:
- Input: `{ deal_id }`
- Auth: user owns deal + deal_fees.status='paid'
- Renders template
- Sends via ZapSign pra ambas partes (lojista + PF)

`POST /api/contracts/webhook` (ZapSign or DocuSign):
- Validates signature
- Updates `contracts.provider_status` + `signed_pdf_url` on signed event
- On 'signed' for exclusivity: sets `deals.status='signed_exclusivity'`
- On 'signed' for purchase-sale: sets `deals.status='signed'`

### 13b.5 — UI integration

Em Phase 12 opportunities dashboard:
- Se `deal.status = 'contract_pending'` e fee paga → botão "Gerar contrato de exclusividade"
- Link pra PDF assinado no Supabase Storage
- Timeline status do contrato (enviado → visto → assinado)

### 13b.6 — LGPD / Security

- PDFs armazenados em bucket privado com service-role write + RLS read
- Signed URLs com expiração (1h) pra download
- Audit trail preservado (provider_envelope_id + contract_events)
- CPF coletado no contrato é PII — hash em logs, plaintext só no PDF

## Open questions

1. **DocuSign vs ZapSign?** Recomendo ZapSign MVP. Confirmar com user.
2. **PF fornece CPF quando?** Provavelmente só no momento de "Assumir deal" — fluxo de pagamento revela que agente coletou telefone, lojista contata, consegue CPF, insere no sistema pra gerar contrato. Ajuste UX em Phase 12.
3. **Template legal review?** Templates precisam validação jurídica antes de ir pra produção. USER action: contratar advogado.
4. **e-signature legal validity BR?** Lei 14.063/2020 valida assinaturas eletrônicas simples (ZapSign qualifica). Qualificada só precisa em imóveis.

## Dependencies

- Phase 13a (fee pago destrava contrato)
- Phase 8 (scraping coleta PF phone)
- USER: ZapSign ou DocuSign account
- USER: Templates legais validados por advogado

## Success criteria

- [ ] Template exclusividade renderiza PDF com vars corretas
- [ ] ZapSign API envia envelope pra PF
- [ ] Webhook sincroniza status
- [ ] PDF assinado acessível via signed URL
- [ ] `deals.status` avança automaticamente
- [ ] Testes: mock provider cobre happy path + declined + expired

## Plans

TBD.
