-- =============================================================================
-- 0002_users_profile.sql — add city/uf columns to users
-- =============================================================================
-- Phase 6 onboarding flow collects profile data (name, company_name, cnpj,
-- city, uf) into the public.users row before the lojista sees /app.
--
-- The 0001_init.sql migration only had name, company_name, cnpj. This
-- migration adds city (free-text) and uf (two-letter state code). Both are
-- nullable so existing rows don't break.
-- =============================================================================

alter table public.users
  add column if not exists city text,
  add column if not exists uf   text;

-- No index — these fields are displayed in /app sidebar/settings but
-- currently never queried. Add an index later if /admin segmentation
-- demands it.
