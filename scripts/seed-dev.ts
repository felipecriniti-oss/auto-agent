#!/usr/bin/env tsx
/**
 * seed-dev.ts — idempotent seed for local Supabase.
 *
 * Creates (or upserts) a dev user `dev@autoagente.local` via the admin auth
 * API, then populates 3 wishlists / 5 listings / 4 opportunities matching
 * the schema in 0001_init.sql.
 *
 * Idempotent strategy:
 *   - User: auth.admin.createUser with email confirm. If the user already
 *     exists (409 / duplicate) we look up their id.
 *   - wishlists: DELETE where user_id=dev THEN re-INSERT (cleaner than
 *     tracking fingerprints).
 *   - listings: UPSERT on `fingerprint` (schema already has `unique` on it).
 *   - opportunities: rebuild from scratch (DELETE where user_id=dev then
 *     re-INSERT) — opportunities have (user_id,wishlist_id,listing_id)
 *     unique, and the ids change between runs since wishlists are recreated.
 *
 * Usage:
 *   pnpm seed
 *
 * Env:
 *   SUPABASE_SERVICE_ROLE_KEY — required (service role bypasses RLS)
 *   NEXT_PUBLIC_SUPABASE_URL  — required
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Lightweight .env.local loader — avoids pulling dotenv just for a script.
function loadDotEnv(): void {
  try {
    const path = resolve(process.cwd(), ".env.local");
    const contents = readFileSync(path, "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      const valRaw = line.slice(eq + 1).trim();
      // strip surrounding quotes if present
      const val = valRaw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env.local not found — fall back to pre-set env vars
  }
}

loadDotEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const DEV_EMAIL = "dev@autoagente.local";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureDevUser(): Promise<string> {
  // Try to find an existing user by listing (limit 1000, filter by email).
  // The admin listUsers endpoint paginates; we scan the first page which is
  // enough for local dev.
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === DEV_EMAIL);
  if (existing) {
    console.log(`[seed] dev user exists: ${existing.id}`);
    return existing.id;
  }

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: DEV_EMAIL,
    email_confirm: true,
    user_metadata: { seeded: true },
  });
  if (createErr) throw createErr;
  if (!created.user) throw new Error("createUser returned no user");
  console.log(`[seed] created dev user: ${created.user.id}`);
  return created.user.id;
}

async function upsertProfile(userId: string): Promise<void> {
  // handle_new_auth_user trigger already created the public.users row;
  // we just patch the dev-friendly defaults.
  const { error } = await supabase
    .from("users")
    .update({
      name: "Dev Lojista",
      company_name: "Dev Motors LTDA",
      cnpj: "00.000.000/0001-00",
      plan: "premium",
      role: "lojista",
      onboarding_complete: true,
      city: "São Paulo",
      uf: "SP",
    })
    .eq("id", userId);
  if (error) throw error;
  console.log("[seed] profile patched");
}

type WishlistSeed = {
  name: string;
  brand: string;
  model: string;
  year_min: number;
  year_max: number;
  km_max: number;
  price_max: number;
  fuel_type: string[];
  transmission?: string[];
  region_uf: string[];
  status?: "active" | "paused" | "archived";
};

const WISHLIST_SEEDS: WishlistSeed[] = [
  {
    name: "Honda Civic 2018+ SP",
    brand: "Honda",
    model: "Civic",
    year_min: 2018,
    year_max: 2024,
    km_max: 80000,
    price_max: 130000,
    fuel_type: ["flex"],
    transmission: ["automático", "CVT"],
    region_uf: ["SP"],
  },
  {
    name: "Toyota Corolla 2019+ SP/RJ",
    brand: "Toyota",
    model: "Corolla",
    year_min: 2019,
    year_max: 2024,
    km_max: 60000,
    price_max: 150000,
    fuel_type: ["flex", "híbrido"],
    transmission: ["automático", "CVT"],
    region_uf: ["SP", "RJ"],
  },
  {
    name: "Chevrolet Onix 2020+ econômico",
    brand: "Chevrolet",
    model: "Onix",
    year_min: 2020,
    year_max: 2024,
    km_max: 90000,
    price_max: 75000,
    fuel_type: ["flex"],
    region_uf: ["SP", "MG"],
    status: "paused",
  },
];

async function seedWishlists(userId: string): Promise<Record<string, string>> {
  // Clear existing
  const { error: delErr } = await supabase.from("wishlists").delete().eq("user_id", userId);
  if (delErr) throw delErr;

  const rows = WISHLIST_SEEDS.map((w) => ({
    user_id: userId,
    name: w.name,
    brand: w.brand,
    model: w.model,
    year_min: w.year_min,
    year_max: w.year_max,
    km_max: w.km_max,
    price_max: w.price_max,
    fuel_type: w.fuel_type,
    transmission: w.transmission ?? [],
    region_uf: w.region_uf,
    status: w.status ?? "active",
  }));

  const { data, error } = await supabase.from("wishlists").insert(rows).select();
  if (error) throw error;
  if (!data) throw new Error("insert wishlists returned no rows");

  const byModel: Record<string, string> = {};
  for (const row of data) {
    byModel[`${row.brand}/${row.model}`] = row.id;
  }
  console.log(`[seed] wishlists inserted: ${data.length}`);
  return byModel;
}

type ListingSeed = {
  fingerprint: string;
  source_listing_id: string;
  brand: string;
  model: string;
  trim: string;
  year: number;
  km: number;
  price: number;
  fipe: number;
  savings_vs_fipe: number;
  savings_pct: number;
  seller_type: "PF" | "PJ";
  seller_uf: string;
  seller_city: string;
  listing_url: string;
  photo_url: string;
  days_online: number;
  reductions: number;
  motivation_signals: Record<string, unknown>;
  attributes: Record<string, unknown>;
};

const LISTING_SEEDS: ListingSeed[] = [
  {
    fingerprint: "fp-seed-001",
    source_listing_id: "wm-seed-001",
    brand: "Honda",
    model: "Civic",
    trim: "EXL",
    year: 2019,
    km: 52000,
    price: 102000,
    fipe: 115000,
    savings_vs_fipe: 13000,
    savings_pct: 11.3,
    seller_type: "PF",
    seller_uf: "SP",
    seller_city: "São Paulo",
    listing_url: "https://www.webmotors.com.br/carros/sp/sao-paulo/honda/civic/2019/exl",
    photo_url: "https://dummyimage.com/600x400/eeeeee/333333&text=Civic+2019",
    days_online: 38,
    reductions: 1,
    motivation_signals: { motivated: true, publish_reason: "Motivo: mudança" },
    attributes: { color: "prata", accept_trade: true },
  },
  {
    fingerprint: "fp-seed-002",
    source_listing_id: "wm-seed-002",
    brand: "Honda",
    model: "Civic",
    trim: "Touring",
    year: 2020,
    km: 45000,
    price: 119000,
    fipe: 129000,
    savings_vs_fipe: 10000,
    savings_pct: 7.75,
    seller_type: "PF",
    seller_uf: "SP",
    seller_city: "Campinas",
    listing_url: "https://www.webmotors.com.br/carros/sp/campinas/honda/civic/2020/touring",
    photo_url: "https://dummyimage.com/600x400/dddddd/333333&text=Civic+2020",
    days_online: 15,
    reductions: 0,
    motivation_signals: { motivated: false },
    attributes: { color: "preto", accept_trade: false },
  },
  {
    fingerprint: "fp-seed-003",
    source_listing_id: "wm-seed-003",
    brand: "Toyota",
    model: "Corolla",
    trim: "XEI",
    year: 2020,
    km: 38000,
    price: 121000,
    fipe: 135000,
    savings_vs_fipe: 14000,
    savings_pct: 10.37,
    seller_type: "PF",
    seller_uf: "SP",
    seller_city: "São Paulo",
    listing_url: "https://www.webmotors.com.br/carros/sp/sao-paulo/toyota/corolla/2020/xei",
    photo_url: "https://dummyimage.com/600x400/cccccc/333333&text=Corolla+2020",
    days_online: 52,
    reductions: 2,
    motivation_signals: { motivated: true, publish_reason: "Motivo: troca por maior" },
    attributes: { color: "prata", accept_trade: true },
  },
  {
    fingerprint: "fp-seed-004",
    source_listing_id: "wm-seed-004",
    brand: "Chevrolet",
    model: "Onix",
    trim: "LT",
    year: 2021,
    km: 30000,
    price: 68000,
    fipe: 75000,
    savings_vs_fipe: 7000,
    savings_pct: 9.33,
    seller_type: "PF",
    seller_uf: "SP",
    seller_city: "Guarulhos",
    listing_url: "https://www.webmotors.com.br/carros/sp/guarulhos/chevrolet/onix/2021/lt",
    photo_url: "https://dummyimage.com/600x400/bbbbbb/333333&text=Onix+2021",
    days_online: 8,
    reductions: 0,
    motivation_signals: { motivated: false },
    attributes: { color: "branco", accept_trade: false },
  },
  {
    fingerprint: "fp-seed-005",
    source_listing_id: "wm-seed-005",
    brand: "Honda",
    model: "Civic",
    trim: "LX",
    year: 2018,
    km: 78000,
    price: 80000,
    fipe: 95000,
    savings_vs_fipe: 15000,
    savings_pct: 15.78,
    seller_type: "PF",
    seller_uf: "SP",
    seller_city: "São Paulo",
    listing_url: "https://www.webmotors.com.br/carros/sp/sao-paulo/honda/civic/2018/lx",
    photo_url: "https://dummyimage.com/600x400/aaaaaa/333333&text=Civic+2018",
    days_online: 62,
    reductions: 2,
    motivation_signals: { motivated: true, publish_reason: "Motivo: preciso vender" },
    attributes: { color: "cinza", accept_trade: true },
  },
];

async function seedListings(): Promise<Record<string, string>> {
  const rows = LISTING_SEEDS.map((l) => ({
    source: "webmotors",
    source_listing_id: l.source_listing_id,
    fingerprint: l.fingerprint,
    brand: l.brand,
    model: l.model,
    trim: l.trim,
    year: l.year,
    km: l.km,
    price: l.price,
    fipe: l.fipe,
    savings_vs_fipe: l.savings_vs_fipe,
    savings_pct: l.savings_pct,
    seller_type: l.seller_type,
    seller_uf: l.seller_uf,
    seller_city: l.seller_city,
    listing_url: l.listing_url,
    photo_url: l.photo_url,
    days_online: l.days_online,
    reductions: l.reductions,
    motivation_signals: l.motivation_signals,
    attributes: l.attributes,
    status: "active" as const,
  }));

  const { data, error } = await supabase
    .from("listings")
    .upsert(rows, { onConflict: "fingerprint" })
    .select();
  if (error) throw error;
  if (!data) throw new Error("upsert listings returned no rows");

  const byFingerprint: Record<string, string> = {};
  for (const row of data) {
    byFingerprint[row.fingerprint] = row.id;
  }
  console.log(`[seed] listings upserted: ${data.length}`);
  return byFingerprint;
}

async function seedOpportunities(
  userId: string,
  wlByModel: Record<string, string>,
  listByFp: Record<string, string>,
): Promise<void> {
  const civicId = wlByModel["Honda/Civic"];
  const corollaId = wlByModel["Toyota/Corolla"];
  if (!civicId || !corollaId) {
    throw new Error("missing wishlist ids");
  }

  const opps = [
    { wishlist_id: civicId, listing_id: listByFp["fp-seed-001"], match_score: 0.92, status: "converged" as const, fee_amount: 390 },
    { wishlist_id: civicId, listing_id: listByFp["fp-seed-002"], match_score: 0.78, status: "negotiating" as const, fee_amount: 300 },
    { wishlist_id: civicId, listing_id: listByFp["fp-seed-005"], match_score: 0.88, status: "initiating" as const, fee_amount: 450 },
    { wishlist_id: corollaId, listing_id: listByFp["fp-seed-003"], match_score: 0.85, status: "pending" as const, fee_amount: 420 },
  ].filter((o) => typeof o.listing_id === "string");

  const { error: delErr } = await supabase.from("opportunities").delete().eq("user_id", userId);
  if (delErr) throw delErr;

  const rows = opps.map((o) => ({
    user_id: userId,
    wishlist_id: o.wishlist_id,
    listing_id: o.listing_id,
    match_score: o.match_score,
    status: o.status,
    fee_amount: o.fee_amount,
  }));

  const { data, error } = await supabase.from("opportunities").insert(rows).select();
  if (error) throw error;
  console.log(`[seed] opportunities inserted: ${data?.length ?? 0}`);
}

async function main(): Promise<void> {
  const userId = await ensureDevUser();
  await upsertProfile(userId);
  const wlByModel = await seedWishlists(userId);
  const listByFp = await seedListings();
  await seedOpportunities(userId, wlByModel, listByFp);
  console.log("[seed] done");
}

main().catch((err) => {
  console.error("[seed] FAILED", err);
  process.exit(1);
});
