---
plan_id: "07-01"
phase: 7
slug: wishlist-ui
wave: 1
title: "Wishlist schema + mock listings + FIPE brands snapshot foundation"
depends_on: []
files_modified:
  - src/lib/schemas/wishlist.ts
  - src/lib/schemas/wishlist.test.ts
  - src/lib/mock-data/preview-listings.ts
  - src/lib/mock-data/preview-listings.test.ts
  - src/lib/brasil/fipe-brands-snapshot.json
  - src/lib/brasil/fipe-brands-snapshot.test.ts
requirements_addressed:
  - D-02
  - D-03
  - D-06
  - D-07
  - D-10
  - D-11
  - GOAL-FORM
  - GOAL-FIPE
  - GOAL-PREVIEW
autonomous: false  # D-03: snapshot.json must be produced by running scripts/sync-fipe-brands.ts (plan 07-04) OR be hand-curated; flagged non-autonomous because executor may need to confirm policy when Parallelum is flaky
must_haves:
  truths:
    - "wishlistSchema parses a full valid wishlist and rejects brand-empty/model-empty/year_min>year_max"
    - "PREVIEW_LISTINGS exports ≥20 curated DbListing rows, all status='active' and seller_type='PF'"
    - "fipe-brands-snapshot.json exports ≥50 brands with {codigo, nome} shape"
    - "Reais type alias is exported for documentative intent at call-sites"
  artifacts:
    - path: "src/lib/schemas/wishlist.ts"
      provides: "wishlistSchema + Reais + WishlistFormValues"
      contains: "export const wishlistSchema = z.object("
    - path: "src/lib/mock-data/preview-listings.ts"
      provides: "20 curated DbListing rows"
      contains: "export const PREVIEW_LISTINGS"
    - path: "src/lib/brasil/fipe-brands-snapshot.json"
      provides: "static brands list"
      contains: "\"brands\":"
  key_links:
    - from: "src/components/forms/WishlistPreviewPane.tsx"
      to: "src/lib/mock-data/preview-listings.ts"
      via: "useListingsSnapshot hook fallback"
      pattern: "PREVIEW_LISTINGS"
    - from: "src/components/forms/FipeBrandCombobox.tsx"
      to: "src/lib/brasil/fipe-brands-snapshot.json"
      via: "static import"
      pattern: "import .* from .*fipe-brands-snapshot"
---

<objective>
Establish the Layer 1 foundation for Phase 7: the Zod wishlist schema (authoritative form + adapter shape), the 20 curated mock listings (D-01 fallback universe), and the FIPE brands static snapshot JSON (D-03 instant-paint source). These three assets have zero coupling to each other and fully parallel downstream work.

Purpose: Without these, no form field, no preview pane, and no FIPE combobox can compile. This plan unblocks Waves 2/3/4.
Output: 6 files (3 source + 3 test), all typecheck/test-green.
</objective>

<execution_context>
@C:/Users/pc/auto-agent/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/pc/auto-agent/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/07-wishlist-ui/07-CONTEXT.md
@.planning/phases/07-wishlist-ui/07-UI-SPEC.md
@.planning/phases/07-wishlist-ui/07-RESEARCH.md
@.planning/phases/07-wishlist-ui/07-PATTERNS.md
@src/lib/schemas/listing.ts
@src/lib/schemas/listing.test.ts
@src/types/database.ts
@src/lib/supabase/hooks/useWishlists.ts
@src/lib/matching/engine.ts
@src/lib/mock-data/v3.ts
</context>

<interfaces>
<!-- From src/types/database.ts — confirmed by RESEARCH.md:130-210 — these are the DB shapes the schema must stay compatible with -->

DbWishlist Row (lines 78-118): id, user_id, name, brand, model, trim, year_min, year_max, km_max, price_max, fuel_type: FuelType[], transmission: Transmission[], armored: boolean | null, region_uf: string[], region_cities: string[], status: WishlistStatus ("active"|"paused"|"archived"), created_at, updated_at

FuelType enum (line 43): "flex" | "gasolina" | "diesel" | "híbrido" | "elétrico"
Transmission enum (line 44): "automático" | "manual" | "CVT"
WishlistStatus enum: "active" | "paused" | "archived"

DbListing Row (lines 121-150): id, source, source_listing_id, fingerprint, brand, model, trim, year, km, price, fipe, savings_vs_fipe, savings_pct, seller_type: "PF"|"PJ", seller_location, seller_uf, seller_city, listing_url, photo_url, days_online, reductions, attributes: Record<string, unknown>, motivation_signals: Record<string, unknown>, first_seen_at, last_scraped_at, status: ListingStatus, created_at, updated_at

WishlistInsertInput (from useWishlists.ts): Omit<DbWishlist, "id"|"user_id"|"created_at"|"updated_at"|"status"> & { status?: WishlistStatus }
</interfaces>

<tasks>

<task id="07-01-01" type="auto" tdd="true">
  <name>Task 1: Wishlist Zod schema with Reais alias + cross-field refine</name>
  <files>src/lib/schemas/wishlist.ts, src/lib/schemas/wishlist.test.ts</files>
  <read_first>
    - src/lib/schemas/listing.ts (lines 1-43 — canonical repo Zod pattern with SAFE_TEXT regex + z.infer)
    - src/lib/schemas/listing.test.ts (lines 1-89 — test idiom: describe + per-edge it + safeParse)
    - src/types/database.ts (lines 40-120 — DbWishlist Row shape; FuelType/Transmission/WishlistStatus enums)
    - src/lib/supabase/hooks/useWishlists.ts (lines 50-85 — WishlistInsertInput shape that useCreateWishlist.mutateAsync accepts)
    - .planning/phases/07-wishlist-ui/07-CONTEXT.md §D-06 (Reais alias), §D-07 (no schema changes to DB), §D-10 ("Aceita troca" OUT — no accepts_trade field), §D-11 (form library locked)
    - .planning/phases/07-wishlist-ui/07-UI-SPEC.md §Copywriting Contract (inline error strings: "Informe a marca", "Informe o modelo", "Ano mínimo não pode ser maior que o máximo")
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 1 §wishlist.ts (canonical schema shape lines 80-106)
    - .planning/phases/07-wishlist-ui/07-RESEARCH.md:291-321 (reference schema)
  </read_first>
  <behavior>
    - Valid full object (brand+model+all optionals filled) → safeParse success
    - Valid minimal object (brand+model only; rest null/empty) → safeParse success with defaults applied (name="", trim=null, arrays=[], nullables=null)
    - brand="" → fail with message "Informe a marca" at path ["brand"]
    - model="" → fail with message "Informe o modelo" at path ["model"]
    - year_min=2020, year_max=2018 → fail with message containing "não pode ser maior" at path ["year_min"]
    - year_min=null OR year_max=null → refine is skipped (valid)
    - fuel_type=["etanol"] → fail (not in enum)
    - fuel_type=["flex","gasolina"] → success
    - transmission=["CVT"] → success; transmission=["cambio manual"] → fail
    - km_max=-1 → fail; km_max=0 → success; km_max=1_500_000 → fail (over 1_000_000 max)
    - price_max=5_500_000 → fail (over 5_000_000 max); price_max=0 → success
    - name injection like "foo\n\nbar" → fail (double-newline guard via SAFE_TEXT pattern)
    - name with "<script>" → fail (SAFE_TEXT regex excludes <>{})
    - WishlistFormValues type is inferred from the schema (typecheck passes when assigning valid parsed object)
    - Reais is exported as `type Reais = number` for documentative intent
  </behavior>
  <action>
    Create `src/lib/schemas/wishlist.ts` with EXACT contents:

    ```typescript
    import { z } from "zod";

    /** Integer reais (no cents). Documentation alias to make the unit explicit at call-sites (D-06). */
    export type Reais = number;

    const CURRENT_YEAR = new Date().getFullYear();
    const SAFE_TEXT = /^[^<>{}]*$/;

    export const wishlistSchema = z
      .object({
        name: z
          .string()
          .max(120, "Nome: máximo 120 caracteres")
          .regex(SAFE_TEXT, "Nome contém caracteres inválidos")
          .refine((s) => !s.includes("\n\n"), "Nome contém caracteres inválidos")
          .optional()
          .default(""),
        brand: z
          .string()
          .min(1, "Informe a marca")
          .max(60, "Marca: máximo 60 caracteres")
          .regex(SAFE_TEXT, "Marca contém caracteres inválidos"),
        model: z
          .string()
          .min(1, "Informe o modelo")
          .max(60, "Modelo: máximo 60 caracteres")
          .regex(SAFE_TEXT, "Modelo contém caracteres inválidos"),
        trim: z
          .string()
          .max(60, "Versão: máximo 60 caracteres")
          .regex(SAFE_TEXT, "Versão contém caracteres inválidos")
          .nullable()
          .optional()
          .default(null),
        year_min: z.number().int().min(1990).max(CURRENT_YEAR + 1).nullable().optional().default(null),
        year_max: z.number().int().min(1990).max(CURRENT_YEAR + 1).nullable().optional().default(null),
        km_max: z.number().int().min(0).max(1_000_000, "KM muito alto").nullable().optional().default(null),
        price_max: z.number().int().min(0).max(5_000_000, "Preço muito alto").nullable().optional().default(null),
        fuel_type: z.array(z.enum(["flex", "gasolina", "diesel", "híbrido", "elétrico"])).default([]),
        transmission: z.array(z.enum(["automático", "manual", "CVT"])).default([]),
        armored: z.boolean().nullable().default(null),
        region_uf: z.array(z.string()).default([]),
        region_cities: z.array(z.string()).default([]),
      })
      .refine(
        (v) => v.year_min == null || v.year_max == null || v.year_min <= v.year_max,
        { message: "Ano mínimo não pode ser maior que o máximo", path: ["year_min"] },
      );

    export type WishlistFormValues = z.infer<typeof wishlistSchema>;
    ```

    Create `src/lib/schemas/wishlist.test.ts` following `listing.test.ts` style. Cover at minimum these 12 cases:

    1. `it("accepts a valid full wishlist")` — all fields filled, safeParse.success === true
    2. `it("accepts minimal wishlist with only brand+model")` — defaults applied, parsed name === "", arrays === []
    3. `it("rejects empty brand")` — error at path ["brand"] with message "Informe a marca"
    4. `it("rejects empty model")` — error at path ["model"] with message "Informe o modelo"
    5. `it("rejects year_min > year_max with cross-field message")` — year_min=2020, year_max=2018 → error path ["year_min"] message contains "não pode ser maior"
    6. `it("allows year_min null with year_max set")` — valid
    7. `it("allows year_max null with year_min set")` — valid
    8. `it("rejects invalid fuel enum")` — fuel_type=["etanol"] → fail
    9. `it("rejects negative km")` — km_max=-1 → fail
    10. `it("rejects price over 5,000,000")` — price_max=5_500_000 → fail
    11. `it("rejects name with angle brackets")` — name="VW <script>" → fail
    12. `it("rejects name with double-newline")` — name="foo\n\nbar" → fail

    Import: `import { describe, expect, it } from "vitest";` and `import { wishlistSchema } from "./wishlist";`

    Use a top-level `validWishlist` const as base and spread with `{...validWishlist, <override>}` per test.
  </action>
  <verify>
    <automated>pnpm test src/lib/schemas/wishlist.test.ts --run</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/schemas/wishlist.ts` exists
    - `grep -n "export const wishlistSchema = z.object" src/lib/schemas/wishlist.ts` returns 1 match
    - `grep -n "export type Reais = number" src/lib/schemas/wishlist.ts` returns 1 match
    - `grep -n "export type WishlistFormValues = z.infer" src/lib/schemas/wishlist.ts` returns 1 match
    - `grep -n "Ano mínimo não pode ser maior que o máximo" src/lib/schemas/wishlist.ts` returns 1 match
    - `grep -n "Informe a marca" src/lib/schemas/wishlist.ts` returns 1 match
    - `grep -n "Informe o modelo" src/lib/schemas/wishlist.ts` returns 1 match
    - `grep -nE 'z\.enum\(\["flex", "gasolina", "diesel", "híbrido", "elétrico"\]\)' src/lib/schemas/wishlist.ts` returns 1 match
    - `grep -nE 'z\.enum\(\["automático", "manual", "CVT"\]\)' src/lib/schemas/wishlist.ts` returns 1 match
    - File `src/lib/schemas/wishlist.test.ts` exists and `pnpm test src/lib/schemas/wishlist.test.ts --run` exits 0 with ≥12 passing tests
    - `pnpm typecheck` exits 0
    - No occurrences of `accepts_trade` (D-10): `grep -n "accepts_trade" src/lib/schemas/wishlist.ts` returns 0 matches
  </acceptance_criteria>
</task>

<task id="07-01-02" type="auto" tdd="true">
  <name>Task 2: Preview listings mock data (20 curated DbListing rows)</name>
  <files>src/lib/mock-data/preview-listings.ts, src/lib/mock-data/preview-listings.test.ts</files>
  <read_first>
    - src/lib/mock-data/v3.ts (lines 1-80 — file-header JSDoc style for Phase 5 mocks)
    - src/types/database.ts (lines 121-150 — DbListing Row shape — every field required)
    - src/lib/matching/engine.ts (lines 156-180 — understand `listing.status !== "active"` and `seller_type !== "PF"` short-circuits)
    - .planning/phases/07-wishlist-ui/07-CONTEXT.md §D-01 (silent mock fallback), §D-02 (mocks location + top 20 models), §Specifics (prices 60k-120k, UFs SP/RJ/MG/PR/RS, Unsplash photos)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 1 §preview-listings.ts (excerpt lines 175-225 — target shape + curation rules)
    - .planning/phases/07-wishlist-ui/07-RESEARCH.md §Pitfall 1 (enforcePfOnly: false + status: "active" MANDATORY)
  </read_first>
  <behavior>
    - PREVIEW_LISTINGS.length >= 20
    - Every entry has status === "active" (engine short-circuit guard)
    - Every entry has seller_type === "PF" (future prod consistency)
    - At least 3 distinct seller_uf values (diversity for preview variance)
    - Every price in [30000, 250000] (realistic 2026 BR secondhand range)
    - Every brand uses canonical spelling (Honda/Toyota/Chevrolet/Hyundai/Jeep/Ford/Volkswagen/Fiat/Renault — engine fuzzy threshold 0.85)
    - Every model is one of: Civic, Corolla, Onix, HB20, Compass, Ka, Polo, T-Cross, Jetta, Tracker, Fit, Yaris, Renegade, Kicks, Creta, Argo, Mobi, Virtus, Nivus, Kwid
    - Every entry has attributes containing one of { transmission, fuel, armored } keys (engine reads these)
  </behavior>
  <action>
    Create `src/lib/mock-data/preview-listings.ts`:

    ```typescript
    /**
     * preview-listings.ts — 20 curated mock DbListing rows for Phase 7 preview pane.
     *
     * Purpose: D-01 silent fallback when Supabase `listings` table returns []. Consumed by
     * `useListingsSnapshot` (Plan 07-05) and rendered into the matching engine by
     * `WishlistPreviewPane` (Plan 07-09).
     *
     * Curation rules (D-02):
     * - 20 entries, top BR seminovos models (Civic, Corolla, Onix, HB20, Compass,
     *   Ka, Polo, T-Cross, Jetta, Tracker, Fit, Yaris, Renegade, Kicks, Creta,
     *   Argo, Mobi, Virtus, Nivus, Kwid)
     * - status="active" and seller_type="PF" on every row (engine short-circuit guards)
     * - Price 60k-120k integer reais (realistic 2026 BR market)
     * - UFs varied across SP/RJ/MG/PR/RS
     * - photo_url is Unsplash CDN OR null (card has placeholder)
     * - attributes includes transmission + fuel + armored where relevant (engine reads)
     */

    import type { DbListing } from "@/types/database";

    export const PREVIEW_LISTINGS: DbListing[] = [
      // Provide 20 entries following this shape. Each entry MUST include EVERY DbListing
      // Row field (id, source, source_listing_id, fingerprint, brand, model, trim, year,
      // km, price, fipe, savings_vs_fipe, savings_pct, seller_type: "PF",
      // seller_location, seller_uf, seller_city, listing_url, photo_url, days_online,
      // reductions, attributes, motivation_signals, first_seen_at, last_scraped_at,
      // status: "active", created_at, updated_at).
      //
      // Use deterministic fake ids: "listing-mock-01" … "listing-mock-20".
      // Use ISO timestamps: "2026-04-10T10:00:00Z" etc.
      //
      // Example row shape:
      {
        id: "listing-mock-01",
        source: "WebMotors",
        source_listing_id: "mock-wm-001",
        fingerprint: "wm-mock-001",
        brand: "Honda",
        model: "Civic",
        trim: "EXL",
        year: 2020,
        km: 45000,
        price: 98000,
        fipe: 105000,
        savings_vs_fipe: 7000,
        savings_pct: 6.67,
        seller_type: "PF",
        seller_location: "São Paulo - SP",
        seller_uf: "SP",
        seller_city: "São Paulo",
        listing_url: "https://www.webmotors.com.br/mock/civic-2020",
        photo_url: "https://images.unsplash.com/photo-honda-civic",
        days_online: 12,
        reductions: 1,
        attributes: { transmission: "automático", fuel: "flex", armored: false, accept_trade: true },
        motivation_signals: { urgency_signal: "relocating" },
        first_seen_at: "2026-04-10T10:00:00Z",
        last_scraped_at: "2026-04-22T10:00:00Z",
        status: "active",
        created_at: "2026-04-10T10:00:00Z",
        updated_at: "2026-04-22T10:00:00Z",
      },
      // …19 more entries covering the other 19 models, distributed across the 5 UFs
    ];
    ```

    The executor must populate all 20 entries by rotating through the model list and UF set, varying prices in 60k-120k, km in 15k-90k, year 2018-2023.

    Create `src/lib/mock-data/preview-listings.test.ts`:

    ```typescript
    import { describe, expect, it } from "vitest";
    import { PREVIEW_LISTINGS } from "./preview-listings";

    describe("PREVIEW_LISTINGS", () => {
      it("has at least 20 entries", () => {
        expect(PREVIEW_LISTINGS.length).toBeGreaterThanOrEqual(20);
      });
      it("every entry has status='active' (engine short-circuit guard)", () => {
        for (const l of PREVIEW_LISTINGS) expect(l.status).toBe("active");
      });
      it("every entry has seller_type='PF'", () => {
        for (const l of PREVIEW_LISTINGS) expect(l.seller_type).toBe("PF");
      });
      it("covers at least 3 distinct UFs", () => {
        const ufs = new Set(PREVIEW_LISTINGS.map((l) => l.seller_uf).filter(Boolean));
        expect(ufs.size).toBeGreaterThanOrEqual(3);
      });
      it("every price is between 30k and 250k reais", () => {
        for (const l of PREVIEW_LISTINGS) {
          if (l.price != null) {
            expect(l.price).toBeGreaterThanOrEqual(30_000);
            expect(l.price).toBeLessThanOrEqual(250_000);
          }
        }
      });
      it("every entry has canonical brand spelling", () => {
        const allowed = new Set(["Honda","Toyota","Chevrolet","Hyundai","Jeep","Ford","Volkswagen","Fiat","Renault"]);
        for (const l of PREVIEW_LISTINGS) {
          if (l.brand) expect(allowed.has(l.brand)).toBe(true);
        }
      });
    });
    ```
  </action>
  <verify>
    <automated>pnpm test src/lib/mock-data/preview-listings.test.ts --run</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/mock-data/preview-listings.ts` exists
    - `grep -n "export const PREVIEW_LISTINGS" src/lib/mock-data/preview-listings.ts` returns 1 match
    - File `src/lib/mock-data/preview-listings.test.ts` exists and test exits 0 with all 6 tests green
    - `grep -c "status: \"active\"" src/lib/mock-data/preview-listings.ts` returns ≥20 (one per entry)
    - `grep -c "seller_type: \"PF\"" src/lib/mock-data/preview-listings.ts` returns ≥20
    - `pnpm typecheck` exits 0 (asserts every entry fully satisfies `DbListing` — no partials)
  </acceptance_criteria>
</task>

<task id="07-01-03" type="auto" tdd="true">
  <name>Task 3: FIPE brands snapshot JSON + shape verification test</name>
  <files>src/lib/brasil/fipe-brands-snapshot.json, src/lib/brasil/fipe-brands-snapshot.test.ts</files>
  <read_first>
    - .planning/phases/07-wishlist-ui/07-CONTEXT.md §D-03 (snapshot location, ~60 brands, manual sync script)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 1 §fipe-brands-snapshot.json (excerpt lines 268-285 — target JSON shape)
    - .planning/phases/07-wishlist-ui/07-RESEARCH.md §Files Novos Esperados (~60 entries)
    - src/lib/schemas/fipe.ts (if exists — for the marcaSchema shape)
  </read_first>
  <behavior>
    - Snapshot JSON parses without error
    - Has top-level keys: `generated_at` (ISO string), `source` (URL string), `brands` (array)
    - brands array length ≥ 50
    - Every brand entry has `codigo: string` and `nome: string` (both non-empty)
    - Date.parse(generated_at) is a valid number (not NaN)
  </behavior>
  <action>
    Create `src/lib/brasil/fipe-brands-snapshot.json` by hand-curating from the canonical top-market-share BR brand list. DO NOT attempt to run `scripts/sync-fipe-brands.ts` yet — that script is authored in Plan 07-04 and is manual-only. If Parallelum is unreachable at execution time, seed the file with a curated static list of 60 real BR brands (codigos from the public Parallelum API — researcher or executor must fetch once via `curl https://parallelum.com.br/fipe/api/v1/carros/marcas | jq` OR copy from the list documented in 07-RESEARCH.md snapshot sample).

    Shape (EXACT):

    ```json
    {
      "generated_at": "2026-04-23T00:00:00.000Z",
      "source": "parallelum.com.br/fipe/api/v1/carros/marcas",
      "brands": [
        { "codigo": "21", "nome": "Chevrolet" },
        { "codigo": "59", "nome": "VW - VolksWagen" },
        { "codigo": "23", "nome": "Fiat" },
        { "codigo": "22", "nome": "Ford" },
        { "codigo": "26", "nome": "Honda" },
        { "codigo": "56", "nome": "Toyota" },
        { "codigo": "25", "nome": "Hyundai" },
        { "codigo": "43", "nome": "Nissan" },
        { "codigo": "48", "nome": "Renault" },
        { "codigo": "28", "nome": "Jeep" }
      ]
    }
    ```

    Extend to ≥ 60 entries covering: Chevrolet, VW, Fiat, Ford, Honda, Toyota, Hyundai, Nissan, Renault, Jeep, Peugeot, Citroen, Kia, Mitsubishi, Mercedes-Benz, BMW, Audi, Volvo, Land Rover, Jaguar, Lexus, Infiniti, Suzuki, Subaru, Mazda, Chery, JAC, Caoa Chery, BYD, GWM, Cadillac, Chrysler, Dodge, Ferrari, Lamborghini, Lotus, Maserati, Mini, Porsche, RAM, Rolls-Royce, Smart, Tesla, TROLLER, Acura, Agrale, Alfa Romeo, Aston Martin, Bentley, Bugatti, Buick, Effa, Geely, Hafei, Isuzu, Iveco, Lifan, Mahindra, McLaren, SSANG YONG — codigos from Parallelum public API.

    Create `src/lib/brasil/fipe-brands-snapshot.test.ts`:

    ```typescript
    import { describe, expect, it } from "vitest";
    import snapshot from "./fipe-brands-snapshot.json";

    describe("fipe-brands-snapshot", () => {
      it("has a generated_at ISO timestamp", () => {
        expect(typeof snapshot.generated_at).toBe("string");
        expect(Number.isNaN(Date.parse(snapshot.generated_at))).toBe(false);
      });
      it("has source url documented", () => {
        expect(typeof snapshot.source).toBe("string");
        expect(snapshot.source.length).toBeGreaterThan(0);
      });
      it("contains at least 50 brands", () => {
        expect(snapshot.brands.length).toBeGreaterThanOrEqual(50);
      });
      it("every brand has codigo + nome (non-empty strings)", () => {
        for (const b of snapshot.brands) {
          expect(typeof b.codigo).toBe("string");
          expect(b.codigo.length).toBeGreaterThan(0);
          expect(typeof b.nome).toBe("string");
          expect(b.nome.length).toBeGreaterThan(0);
        }
      });
      it("has no duplicate codigos", () => {
        const set = new Set(snapshot.brands.map((b: { codigo: string }) => b.codigo));
        expect(set.size).toBe(snapshot.brands.length);
      });
    });
    ```

    Also set up tsconfig import by ensuring `"resolveJsonModule": true` is already set (it is per Next.js defaults) — verify by running `pnpm typecheck`.
  </action>
  <verify>
    <automated>pnpm test src/lib/brasil/fipe-brands-snapshot.test.ts --run</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/brasil/fipe-brands-snapshot.json` exists
    - `node -e "const s=require('./src/lib/brasil/fipe-brands-snapshot.json'); console.log(s.brands.length)"` prints a number ≥ 50
    - `node -e "const s=require('./src/lib/brasil/fipe-brands-snapshot.json'); console.log(typeof s.generated_at, !Number.isNaN(Date.parse(s.generated_at)))"` prints `string true`
    - File `src/lib/brasil/fipe-brands-snapshot.test.ts` exists; `pnpm test src/lib/brasil/fipe-brands-snapshot.test.ts --run` exits 0 with 5 passing tests
    - `pnpm typecheck` exits 0
    - `grep -n "Honda" src/lib/brasil/fipe-brands-snapshot.json` returns ≥1 match (smoke check that common brands are present)
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `pnpm test src/lib/schemas/wishlist.test.ts src/lib/mock-data/preview-listings.test.ts src/lib/brasil/fipe-brands-snapshot.test.ts --run` exits 0
- `pnpm typecheck` exits 0
- `pnpm lint` exits 0 for the three source files
- `grep -rn "accepts_trade" src/lib/schemas/wishlist.ts` returns empty (D-10 compliance)
- `grep -rn "swr" package.json src/lib/schemas/` returns empty (L4 landmine — no swr introduction)
</verification>

<success_criteria>
- wishlistSchema parses and rejects the 12 cases enumerated in task 07-01-01
- PREVIEW_LISTINGS has ≥20 rows, all status/seller_type correct, UF diverse
- fipe-brands-snapshot.json has ≥50 brand entries, shape verified
- All three test files green in <5s
- WishlistFormValues type inferred and exported — downstream plans can `import type { WishlistFormValues } from "@/lib/schemas/wishlist"`
</success_criteria>

<output>
After completion, create `.planning/phases/07-wishlist-ui/07-01-SUMMARY.md` with:
- Files created + line counts
- Test count + execution time
- Any curation decisions (e.g., which 60 brands selected if hand-curated)
- Compatibility confirmation with `WishlistInsertInput` from useWishlists.ts
</output>
