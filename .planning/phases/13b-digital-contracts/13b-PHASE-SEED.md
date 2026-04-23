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

> **Decomposição executiva da Phase 13** (pivot 3). Spec do PRD v3 mantida integralmente. Separado porque template system + signing integration podem ser construídos paralelamente ao agente — o trigger real fica aguardando Phase 10/11 retornarem.

## Goal

Infraestrutura pra gerar e assinar digitalmente (per PRD v3):
1. **Exclusividade digital 7 dias** — PF se compromete a não vender pra outra pessoa enquanto AutoAgente fecha
2. **Compra e venda** — contrato final entre lojista e PF após fechamento

**Provider:** DocuSign embedded (spec explícita do PRD v3). Custo: ~R$ 25/contrato.

Sem alternativas consideradas — PRD v3 é autoridade. Pai pesquisou DocuSign e decidiu. Não desviar.

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

### 13b.2 — DocuSign client

`src/lib/contracts/docusign.ts`:
- DocuSign eSignature REST API client
- JWT OAuth authentication (server-side only, uses `DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_USER_ID`, `DOCUSIGN_ACCOUNT_ID`, `DOCUSIGN_PRIVATE_KEY`)
- `sendForSignature(envelope)` → POST /accounts/{accountId}/envelopes
- `fetchStatus(envelopeId)` → GET envelope status
- Webhook handler for status updates (DocuSign Connect)

Conforme PRD v3, DocuSign é o provider único. Não abstrair pra multi-provider.

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
  provider text DEFAULT 'docusign',
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
- Loads PF data from opportunity + listing
- Renders template + creates contract row
- Sends via DocuSign
- Returns envelope_id

> **Gate PRD:** trigger real desse endpoint espera thread convergida do agente (Phase 11). Na execução atual, a infra é construída + testável com dados mock, mas o botão "gerar contrato de exclusividade" na UI só aparece pós-convergência per PRD.

`POST /api/contracts/purchase-sale`:
- Input: `{ deal_id }`
- Auth: user owns deal + deal_fees.status='paid'
- Renders template
- Sends via DocuSign pra ambas partes (lojista + PF)

`POST /api/contracts/webhook` (DocuSign Connect):
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

1. **PF fornece CPF quando?** Provavelmente só no momento de "Assumir deal" pós-convergência (fluxo PRD v3 Phase 12). Ajuste UX em Phase 12 quando destravar.
2. **Template legal review?** Templates precisam validação jurídica antes de ir pra produção. USER action: contratar advogado.
3. **DocuSign SKU:** eSignature Business ou Advanced? Plan básico cobre os dois contratos. Advanced só se precisar de clauses tipo audio/video capture.

## Dependencies

- Phase 13a (fee pago destrava contrato)
- Phase 10/11 (DEFERRED — convergência do agente dispara exclusividade per PRD)
- USER: DocuSign account (conforme PRD v3)
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
