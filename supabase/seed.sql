-- =============================================================================
-- Dev seed data
-- =============================================================================
-- Run after migrations. Assumes one auth user exists with email 'dev@autoagente.local'.
-- Create that user via Supabase dashboard, magic-link flow, or:
--   supabase auth sign-up --email dev@autoagente.local --password devdev123
-- Then run this seed:
--   psql $DATABASE_URL -f supabase/seed.sql
-- =============================================================================

do $$
declare
  dev_user_id uuid;
  wl_civic_id uuid;
  wl_corolla_id uuid;
  wl_onix_id uuid;
  listing1_id uuid;
  listing2_id uuid;
  listing3_id uuid;
  listing4_id uuid;
  listing5_id uuid;
begin
  -- find dev user
  select id into dev_user_id
  from auth.users
  where email = 'dev@autoagente.local'
  limit 1;

  if dev_user_id is null then
    raise notice 'Dev user not found. Create dev@autoagente.local first via Supabase dashboard or auth API.';
    return;
  end if;

  -- update profile
  update public.users
  set name = 'Dev Lojista',
      company_name = 'Dev Motors LTDA',
      cnpj = '00.000.000/0001-00',
      plan = 'premium',
      role = 'lojista',
      onboarding_complete = true
  where id = dev_user_id;

  -- wishlists ---------------------------------------------------------------
  insert into public.wishlists (user_id, name, brand, model, year_min, year_max, km_max, price_max, fuel_type, transmission, region_uf)
  values
    (dev_user_id, 'Honda Civic 2018+ SP', 'Honda', 'Civic', 2018, 2024, 80000, 130000, '{flex}', '{automático,CVT}', '{SP}')
  returning id into wl_civic_id;

  insert into public.wishlists (user_id, name, brand, model, year_min, year_max, km_max, price_max, fuel_type, transmission, region_uf)
  values
    (dev_user_id, 'Toyota Corolla 2019+ SP/RJ', 'Toyota', 'Corolla', 2019, 2024, 60000, 150000, '{flex,híbrido}', '{automático,CVT}', '{SP,RJ}')
  returning id into wl_corolla_id;

  insert into public.wishlists (user_id, name, brand, model, year_min, year_max, km_max, price_max, fuel_type, region_uf, status)
  values
    (dev_user_id, 'Chevrolet Onix 2020+ econômico', 'Chevrolet', 'Onix', 2020, 2024, 90000, 75000, '{flex}', '{SP,MG}', 'paused')
  returning id into wl_onix_id;

  -- listings ----------------------------------------------------------------
  insert into public.listings (source, source_listing_id, fingerprint, brand, model, trim, year, km, price, fipe, savings_vs_fipe, savings_pct, seller_type, seller_uf, seller_city, listing_url, photo_url, days_online, reductions, motivation_signals, attributes)
  values
    ('webmotors', 'wm-seed-001', 'fp-seed-001', 'Honda', 'Civic', 'EXL', 2019, 52000, 102000, 115000, 13000, 11.30, 'PF', 'SP', 'São Paulo', 'https://www.webmotors.com.br/carros/sp/sao-paulo/honda/civic/2019/exl', 'https://dummyimage.com/600x400/eeeeee/333333&text=Civic+2019', 38, 1, '{"motivated":true,"publish_reason":"Motivo: mudança"}', '{"color":"prata","accept_trade":true}')
  returning id into listing1_id;

  insert into public.listings (source, source_listing_id, fingerprint, brand, model, trim, year, km, price, fipe, savings_vs_fipe, savings_pct, seller_type, seller_uf, seller_city, listing_url, photo_url, days_online, reductions, motivation_signals, attributes)
  values
    ('webmotors', 'wm-seed-002', 'fp-seed-002', 'Honda', 'Civic', 'Touring', 2020, 45000, 119000, 129000, 10000, 7.75, 'PF', 'SP', 'Campinas', 'https://www.webmotors.com.br/carros/sp/campinas/honda/civic/2020/touring', 'https://dummyimage.com/600x400/dddddd/333333&text=Civic+2020', 15, 0, '{"motivated":false}', '{"color":"preto","accept_trade":false}')
  returning id into listing2_id;

  insert into public.listings (source, source_listing_id, fingerprint, brand, model, trim, year, km, price, fipe, savings_vs_fipe, savings_pct, seller_type, seller_uf, seller_city, listing_url, photo_url, days_online, reductions, motivation_signals, attributes)
  values
    ('webmotors', 'wm-seed-003', 'fp-seed-003', 'Toyota', 'Corolla', 'XEI', 2020, 38000, 121000, 135000, 14000, 10.37, 'PF', 'SP', 'São Paulo', 'https://www.webmotors.com.br/carros/sp/sao-paulo/toyota/corolla/2020/xei', 'https://dummyimage.com/600x400/cccccc/333333&text=Corolla+2020', 52, 2, '{"motivated":true,"publish_reason":"Motivo: troca por maior"}', '{"color":"prata","accept_trade":true}')
  returning id into listing3_id;

  insert into public.listings (source, source_listing_id, fingerprint, brand, model, trim, year, km, price, fipe, savings_vs_fipe, savings_pct, seller_type, seller_uf, seller_city, listing_url, photo_url, days_online, reductions, motivation_signals, attributes)
  values
    ('webmotors', 'wm-seed-004', 'fp-seed-004', 'Chevrolet', 'Onix', 'LT', 2021, 30000, 68000, 75000, 7000, 9.33, 'PF', 'SP', 'Guarulhos', 'https://www.webmotors.com.br/carros/sp/guarulhos/chevrolet/onix/2021/lt', 'https://dummyimage.com/600x400/bbbbbb/333333&text=Onix+2021', 8, 0, '{"motivated":false}', '{"color":"branco","accept_trade":false}')
  returning id into listing4_id;

  insert into public.listings (source, source_listing_id, fingerprint, brand, model, trim, year, km, price, fipe, savings_vs_fipe, savings_pct, seller_type, seller_uf, seller_city, listing_url, photo_url, days_online, reductions, motivation_signals, attributes)
  values
    ('webmotors', 'wm-seed-005', 'fp-seed-005', 'Honda', 'Civic', 'LX', 2018, 78000, 80000, 95000, 15000, 15.78, 'PF', 'SP', 'São Paulo', 'https://www.webmotors.com.br/carros/sp/sao-paulo/honda/civic/2018/lx', 'https://dummyimage.com/600x400/aaaaaa/333333&text=Civic+2018', 62, 2, '{"motivated":true,"publish_reason":"Motivo: preciso vender"}', '{"color":"cinza","accept_trade":true}')
  returning id into listing5_id;

  -- opportunities ------------------------------------------------------------
  insert into public.opportunities (user_id, wishlist_id, listing_id, match_score, status, fee_amount)
  values
    (dev_user_id, wl_civic_id,   listing1_id, 0.92, 'converged',   390),
    (dev_user_id, wl_civic_id,   listing2_id, 0.78, 'negotiating', 300),
    (dev_user_id, wl_civic_id,   listing5_id, 0.88, 'initiating',  450),
    (dev_user_id, wl_corolla_id, listing3_id, 0.85, 'pending',     420);

  raise notice 'Seed complete for user %', dev_user_id;
end $$;
