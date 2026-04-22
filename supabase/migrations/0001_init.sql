-- =============================================================================
-- AutoAgent — initial schema (Phase 6)
-- =============================================================================
-- Covers all tables used by phases 7-13:
--   users, wishlists, listings, opportunities, deals, subscriptions,
--   agent_threads, agent_messages, bot_accounts, pending_outbox, scrape_runs,
--   opt_out_list, listing_price_history
--
-- Conventions:
--   - ids: uuid, generated via gen_random_uuid() (pgcrypto)
--   - timestamps: timestamptz, created_at default now(), updated_at trigger-updated
--   - multi-tenant isolation: RLS policies keyed on auth.uid() = user_id
--   - service role bypasses RLS for scraper / agent loop / admin ops
-- =============================================================================

-- -- extensions ---------------------------------------------------------------

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- -- updated_at trigger helper -----------------------------------------------

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- users
-- =============================================================================

create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  name        text,
  company_name text,
  cnpj        text,
  plan        text not null default 'starter' check (plan in ('starter','premium','enterprise')),
  role        text not null default 'lojista' check (role in ('lojista','admin')),
  onboarding_complete boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger tg_users_updated_at
  before update on public.users
  for each row execute function public.tg_set_updated_at();

-- Auto-create users row on auth signup
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- =============================================================================
-- wishlists
-- =============================================================================

create table public.wishlists (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  name          text not null,
  brand         text not null,
  model         text not null,
  trim          text,
  year_min      int,
  year_max      int,
  km_max        int,
  price_max     numeric(12,2),
  fuel_type     text[] not null default '{}',
  transmission  text[] not null default '{}',
  armored       boolean,
  region_uf     text[] not null default '{}',
  region_cities text[] not null default '{}',
  status        text not null default 'active' check (status in ('active','paused','archived')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_wishlists_user_status on public.wishlists(user_id, status);
create index idx_wishlists_brand_model on public.wishlists(lower(brand), lower(model));

create trigger tg_wishlists_updated_at
  before update on public.wishlists
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- listings
-- =============================================================================

create table public.listings (
  id                 uuid primary key default gen_random_uuid(),
  source             text not null default 'webmotors',
  source_listing_id  text not null,
  fingerprint        text not null,
  brand              text,
  model              text,
  trim               text,
  year               int,
  km                 int,
  price              numeric(12,2),
  fipe               numeric(12,2),
  savings_vs_fipe    numeric(12,2),
  savings_pct        numeric(5,2),
  seller_type        text check (seller_type in ('PF','PJ')),
  seller_location    text,
  seller_uf          text,
  seller_city        text,
  listing_url        text,
  photo_url          text,
  days_online        int,
  reductions         int,
  attributes         jsonb not null default '{}'::jsonb,
  motivation_signals jsonb not null default '{}'::jsonb,
  first_seen_at      timestamptz not null default now(),
  last_scraped_at    timestamptz not null default now(),
  status             text not null default 'active' check (status in ('active','removed','stale')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (source, source_listing_id),
  unique (fingerprint)
);

create index idx_listings_brand_model_year on public.listings(lower(brand), lower(model), year);
create index idx_listings_status_last_scraped on public.listings(status, last_scraped_at);
create index idx_listings_seller_uf on public.listings(seller_uf);
create index idx_listings_seller_type on public.listings(seller_type);

create trigger tg_listings_updated_at
  before update on public.listings
  for each row execute function public.tg_set_updated_at();

-- optional price history (Phase 13 nice-to-have)
create table public.listing_price_history (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  price      numeric(12,2) not null,
  recorded_at timestamptz not null default now()
);
create index idx_lph_listing on public.listing_price_history(listing_id, recorded_at desc);

-- =============================================================================
-- bot_accounts (service-role only)
-- =============================================================================

create table public.bot_accounts (
  id                  uuid primary key default gen_random_uuid(),
  source              text not null default 'webmotors',
  email               text not null,
  encrypted_password  text not null,
  status              text not null default 'warming' check (status in ('warming','active','shadow_banned','dead')),
  messages_sent_today int not null default 0,
  messages_sent_total int not null default 0,
  last_used_at        timestamptz,
  max_daily_messages  int not null default 10,
  cooldown_until      timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (source, email)
);

create index idx_bot_accounts_status on public.bot_accounts(status, last_used_at);

create trigger tg_bot_accounts_updated_at
  before update on public.bot_accounts
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- agent_threads (created alongside opportunities)
-- =============================================================================

create table public.agent_threads (
  id                      uuid primary key default gen_random_uuid(),
  opportunity_id          uuid unique,   -- FK deferred — circular w/ opportunities
  bot_account_id          uuid references public.bot_accounts(id) on delete restrict,
  webmotors_thread_url    text,
  status                  text not null default 'initiating' check (status in (
    'initiating','awaiting_pf_response','awaiting_agent_response',
    'converged','lost','escalated'
  )),
  round                   int not null default 0,
  first_message_sent_at   timestamptz,
  last_pf_message_at      timestamptz,
  last_agent_message_at   timestamptz,
  converged_at            timestamptz,
  target_price            numeric(12,2),
  current_offer           numeric(12,2),
  pf_name                 text,
  pf_phone                text,
  escalation_reason       text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_agent_threads_status on public.agent_threads(status, updated_at);
create index idx_agent_threads_bot on public.agent_threads(bot_account_id, status);

create trigger tg_agent_threads_updated_at
  before update on public.agent_threads
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- opportunities (refers to threads, and threads ref back to opportunities)
-- =============================================================================

create table public.opportunities (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  wishlist_id      uuid not null references public.wishlists(id) on delete cascade,
  listing_id       uuid not null references public.listings(id) on delete cascade,
  match_score      numeric(5,4),
  status           text not null default 'pending' check (status in (
    'pending','initiating','negotiating','converged','lost','escalated','assumed','expired'
  )),
  fee_amount       numeric(12,2),
  agent_thread_id  uuid references public.agent_threads(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, wishlist_id, listing_id)
);

create index idx_opportunities_user_status on public.opportunities(user_id, status);
create index idx_opportunities_wishlist on public.opportunities(wishlist_id);
create index idx_opportunities_listing on public.opportunities(listing_id);

create trigger tg_opportunities_updated_at
  before update on public.opportunities
  for each row execute function public.tg_set_updated_at();

-- finish the circular FK on agent_threads
alter table public.agent_threads
  add constraint fk_agent_threads_opportunity
  foreign key (opportunity_id)
  references public.opportunities(id)
  on delete cascade;

-- =============================================================================
-- agent_messages
-- =============================================================================

create table public.agent_messages (
  id                    uuid primary key default gen_random_uuid(),
  thread_id             uuid not null references public.agent_threads(id) on delete cascade,
  direction             text not null check (direction in ('inbound','outbound')),
  body                  text not null,
  model                 text,
  prompt_version        text,
  sent_at               timestamptz,
  received_at           timestamptz,
  webmotors_message_id  text,
  created_at            timestamptz not null default now(),
  unique (thread_id, webmotors_message_id)
);

create index idx_agent_messages_thread_created on public.agent_messages(thread_id, created_at);

-- =============================================================================
-- pending_outbox (service-role queue)
-- =============================================================================

create table public.pending_outbox (
  id             uuid primary key default gen_random_uuid(),
  thread_id      uuid not null references public.agent_threads(id) on delete cascade,
  body           text not null,
  scheduled_for  timestamptz not null default now(),
  attempts       int not null default 0,
  last_error     text,
  status         text not null default 'queued' check (status in ('queued','sending','sent','failed','dead_lettered')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_outbox_status_scheduled on public.pending_outbox(status, scheduled_for);

create trigger tg_outbox_updated_at
  before update on public.pending_outbox
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- scrape_runs (admin read; service write)
-- =============================================================================

create table public.scrape_runs (
  id               uuid primary key default gen_random_uuid(),
  source           text not null default 'webmotors',
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  status           text not null default 'running' check (status in ('running','completed','failed')),
  apify_run_id     text,
  cost_usd         numeric(8,4),
  listings_new     int not null default 0,
  listings_updated int not null default 0,
  listings_error   int not null default 0,
  notes            text,
  created_at       timestamptz not null default now()
);

create index idx_scrape_runs_started on public.scrape_runs(started_at desc);

-- =============================================================================
-- opt_out_list (LGPD compliance)
-- =============================================================================

create table public.opt_out_list (
  id                 uuid primary key default gen_random_uuid(),
  phone_hash         text unique,                   -- sha256 of phone
  webmotors_user_id  text unique,                   -- scraped from thread
  reason             text,                          -- 'SAIR' | 'bounce' | 'manual'
  opted_out_at       timestamptz not null default now()
);

-- =============================================================================
-- deals
-- =============================================================================

create table public.deals (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null references public.users(id) on delete cascade,
  opportunity_id             uuid unique references public.opportunities(id) on delete set null,
  status                     text not null default 'contract_pending' check (status in (
    'contract_pending','signed','inspection','transferring','finalized','canceled'
  )),
  fee_paid_amount            numeric(12,2),
  stripe_charge_id           text,
  contract_url               text,
  zapsign_document_id        text,
  seller_contact_shared_at   timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index idx_deals_user_status on public.deals(user_id, status);

create trigger tg_deals_updated_at
  before update on public.deals
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- subscriptions
-- =============================================================================

create table public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid unique not null references public.users(id) on delete cascade,
  stripe_customer_id      text unique,
  stripe_subscription_id  text unique,
  tier                    text not null default 'starter' check (tier in ('starter','premium','enterprise')),
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger tg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- RLS policies — default deny, then grant
-- =============================================================================

alter table public.users            enable row level security;
alter table public.wishlists        enable row level security;
alter table public.listings         enable row level security;
alter table public.opportunities    enable row level security;
alter table public.agent_threads    enable row level security;
alter table public.agent_messages   enable row level security;
alter table public.bot_accounts     enable row level security;
alter table public.pending_outbox   enable row level security;
alter table public.scrape_runs      enable row level security;
alter table public.opt_out_list     enable row level security;
alter table public.deals            enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.listing_price_history enable row level security;

-- users: self-read, self-update (cannot delete or insert — handled by trigger)
create policy users_self_read on public.users
  for select using (auth.uid() = id);
create policy users_self_update on public.users
  for update using (auth.uid() = id);

-- wishlists: user owns
create policy wishlists_user_all on public.wishlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- listings: authenticated can read, only service writes
create policy listings_auth_read on public.listings
  for select using (auth.role() = 'authenticated');

-- listing_price_history: authenticated can read
create policy lph_auth_read on public.listing_price_history
  for select using (auth.role() = 'authenticated');

-- opportunities: user owns
create policy opportunities_user_all on public.opportunities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- agent_threads: user reads via opportunity ownership
create policy agent_threads_user_read on public.agent_threads
  for select using (
    exists (
      select 1 from public.opportunities o
      where o.id = agent_threads.opportunity_id and o.user_id = auth.uid()
    )
  );

-- agent_messages: user reads via thread ownership
create policy agent_messages_user_read on public.agent_messages
  for select using (
    exists (
      select 1 from public.agent_threads t
      join public.opportunities o on o.id = t.opportunity_id
      where t.id = agent_messages.thread_id and o.user_id = auth.uid()
    )
  );

-- bot_accounts / pending_outbox / opt_out_list: service role only (no client policy)
-- (no policy = default deny for non-service role)

-- scrape_runs: admin reads
create policy scrape_runs_admin_read on public.scrape_runs
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- deals: user owns
create policy deals_user_all on public.deals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- subscriptions: user reads own
create policy subscriptions_user_read on public.subscriptions
  for select using (auth.uid() = user_id);

-- =============================================================================
-- Helper views
-- =============================================================================

-- Opportunities enriched w/ listing + wishlist + thread for dashboard queries
create or replace view public.opportunities_enriched as
select
  o.*,
  l.brand       as listing_brand,
  l.model       as listing_model,
  l.year        as listing_year,
  l.km          as listing_km,
  l.price       as listing_price,
  l.fipe        as listing_fipe,
  l.savings_pct,
  l.photo_url,
  l.listing_url,
  l.seller_city,
  l.seller_uf,
  w.name        as wishlist_name,
  t.status      as thread_status,
  t.round       as thread_round,
  t.last_pf_message_at,
  t.last_agent_message_at
from public.opportunities o
join public.listings l    on l.id = o.listing_id
join public.wishlists w   on w.id = o.wishlist_id
left join public.agent_threads t on t.id = o.agent_thread_id;

grant select on public.opportunities_enriched to authenticated;

-- =============================================================================
-- Realtime publications (for Supabase realtime)
-- =============================================================================

-- Enable realtime on tables the client subscribes to
alter publication supabase_realtime add table public.opportunities;
alter publication supabase_realtime add table public.agent_threads;
alter publication supabase_realtime add table public.agent_messages;
alter publication supabase_realtime add table public.deals;
