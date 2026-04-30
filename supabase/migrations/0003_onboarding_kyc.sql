-- =============================================================================
-- 0003_onboarding_kyc.sql — onboarding v3.2 + KYC fields
-- =============================================================================
-- Extends public.users with phone verification, CNPJ enrichment, operation
-- type, volume, and KYC status fields. Creates kyc_documents table for
-- document storage references.
-- =============================================================================

-- ─── KYC status enum ─────────────────────────────────────────────────────────
create type public.kyc_status as enum (
  'pending',
  'submitted',
  'verified',
  'rejected',
  'expired'
);

-- ─── Operation type enum ─────────────────────────────────────────────────────
create type public.tipo_operacao as enum (
  'loja_fisica',
  'patio',
  'home_office',
  'consignacao',
  'investidor'
);

-- ─── Volume mensal enum ──────────────────────────────────────────────────────
create type public.volume_mensal as enum (
  '1-5',
  '6-15',
  '16-30',
  '30+'
);

-- ─── KYC document type enum ──────────────────────────────────────────────────
create type public.kyc_doc_type as enum (
  'rg_frente',
  'rg_verso',
  'cnh_frente',
  'cnh_verso',
  'selfie',
  'comprovante',
  'contrato_social'
);

-- ─── Extend users table ──────────────────────────────────────────────────────
alter table public.users
  add column if not exists phone             text,
  add column if not exists phone_verified    boolean        default false,
  add column if not exists cnpj_razao_social text,
  add column if not exists cnpj_situacao     text,
  add column if not exists cnpj_cnae         text,
  add column if not exists tipo_operacao     public.tipo_operacao,
  add column if not exists volume_mensal     public.volume_mensal,
  add column if not exists lead_source       text,
  add column if not exists kyc_status        public.kyc_status  default 'pending',
  add column if not exists kyc_submitted_at  timestamptz,
  add column if not exists kyc_verified_at   timestamptz,
  add column if not exists kyc_rejection_reason text,
  add column if not exists kyc_provider_ref  text,
  add column if not exists kyc_expires_at    timestamptz;

-- ─── KYC documents table ─────────────────────────────────────────────────────
create table if not exists public.kyc_documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  doc_type     public.kyc_doc_type not null,
  storage_path text not null,
  ocr_data     jsonb default '{}',
  verified     boolean default false,
  created_at   timestamptz default now()
);

-- Index for lookup by user
create index if not exists idx_kyc_documents_user_id on public.kyc_documents(user_id);

-- RLS: users can only read/insert their own documents
alter table public.kyc_documents enable row level security;

create policy "Users can view own kyc docs"
  on public.kyc_documents for select
  using (auth.uid() = user_id);

create policy "Users can insert own kyc docs"
  on public.kyc_documents for insert
  with check (auth.uid() = user_id);

-- Admins can do everything (role check via users table)
create policy "Admins can manage all kyc docs"
  on public.kyc_documents for all
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

-- ─── Storage bucket for KYC documents (run via Supabase dashboard or CLI) ────
-- Note: Supabase storage buckets are created via the dashboard or supabase CLI,
-- not via SQL migration. Document this for the setup guide:
--   Bucket name: kyc-documents
--   Public: false
--   File size limit: 10MB
--   Allowed MIME types: image/jpeg, image/png, application/pdf
