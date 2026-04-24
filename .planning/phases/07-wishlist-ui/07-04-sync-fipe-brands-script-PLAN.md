---
plan_id: "07-04"
phase: 7
slug: wishlist-ui
wave: 1
title: "scripts/sync-fipe-brands.ts — manual snapshot generator"
# B4 resolution: the script fetches Parallelum DIRECTLY via native fetch (PARALLELUM_URL constant
# points to `https://parallelum.com.br/fipe/api/v1/carros/marcas`). It does NOT route through the
# local `/api/fipe` endpoint. Therefore it has no runtime dependency on plan 07-03 — the prior
# `depends_on: ["07-03"]` was a topological misclassification. Dependency dropped; plan stays in wave 1.
depends_on: []
files_modified:
  - scripts/sync-fipe-brands.ts
  - package.json
requirements_addressed:
  - D-03
autonomous: false   # Running the script writes to fipe-brands-snapshot.json which plan 07-01 already seeded; re-runs require network to Parallelum or a running dev server and are explicitly MANUAL (not CI/build)
must_haves:
  truths:
    - "scripts/sync-fipe-brands.ts is executable via `pnpm tsx scripts/sync-fipe-brands.ts` or `pnpm sync:fipe`"
    - "Script writes {generated_at, source, brands: [...]} to src/lib/brasil/fipe-brands-snapshot.json"
    - "Script fetches Parallelum /marcas directly (not localhost /api/fipe — simpler, avoids dev-server dep)"
    - "Script does NOT run in build or CI (no postinstall, no prebuild hook)"
  artifacts:
    - path: "scripts/sync-fipe-brands.ts"
      provides: "manual tsx script"
      contains: "#!/usr/bin/env tsx"
    - path: "package.json"
      provides: "sync:fipe script entry"
      contains: "\"sync:fipe\":"
  key_links:
    - from: "scripts/sync-fipe-brands.ts"
      to: "src/lib/brasil/fipe-brands-snapshot.json"
      via: "writeFileSync"
      pattern: "fipe-brands-snapshot\\.json"
---

<objective>
Create the manual snapshot-regeneration script per D-03. This script is invoked BY HAND whenever Parallelum updates its brand list — it is explicitly NOT in the build pipeline and NOT in CI. When snapshot drifts, user runs `pnpm sync:fipe` once, commits the resulting JSON diff, done.

Purpose: Decouples the snapshot JSON (seeded in Plan 07-01) from manual editing. Provides a single source of truth for regenerating the static asset.
Output: 1 new script + 1 package.json script entry. No tests required — manual tooling, sanity verified by running the script once and observing `git diff` on snapshot file.
</objective>

<execution_context>
@C:/Users/pc/auto-agent/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/pc/auto-agent/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/07-wishlist-ui/07-CONTEXT.md
@.planning/phases/07-wishlist-ui/07-RESEARCH.md
@.planning/phases/07-wishlist-ui/07-PATTERNS.md
@scripts/seed-dev.ts
@package.json
</context>

<interfaces>
<!-- From scripts/seed-dev.ts:1-52 — the canonical tsx script pattern in this repo -->

Script structure:
  #!/usr/bin/env tsx
  /** JSDoc usage + env */
  import { ... } from "node:fs";
  function loadDotEnv(): void { ... }   // copied verbatim for consistency (unused here but preserves script idiom)
  loadDotEnv();
  async function main(): Promise<void> { ... }
  main().catch((e) => { console.error(e); process.exit(1); });

Parallelum contract (public, no key):
  GET https://parallelum.com.br/fipe/api/v1/carros/marcas
  → Response: [{ codigo: string, nome: string }, ...]
</interfaces>

<tasks>

<task id="07-04-01" type="auto">
  <name>Task 1: Create scripts/sync-fipe-brands.ts tsx script</name>
  <files>scripts/sync-fipe-brands.ts</files>
  <read_first>
    - scripts/seed-dev.ts (first 100 lines — verbatim template: shebang, JSDoc, loadDotEnv helper, main() IIFE)
    - src/lib/brasil/fipe-brands-snapshot.json (target shape — plan 07-01 seeded)
    - .planning/phases/07-wishlist-ui/07-CONTEXT.md §D-03 (manual re-run, not in CI)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 1 §sync-fipe-brands.ts (excerpt lines 321-380)
    - .planning/phases/07-wishlist-ui/07-RESEARCH.md §A1 (Parallelum flakiness assumption)
  </read_first>
  <action>
    Create `scripts/sync-fipe-brands.ts`:

    ```typescript
    #!/usr/bin/env tsx
    /**
     * sync-fipe-brands.ts — manual regenerator for src/lib/brasil/fipe-brands-snapshot.json
     *
     * Purpose: D-03 — keeps the static FIPE brands snapshot fresh without leaning on
     * Parallelum at runtime. Run this manually whenever Parallelum publishes new marcas.
     *
     * Usage:
     *   pnpm sync:fipe
     *   # or
     *   pnpm tsx scripts/sync-fipe-brands.ts
     *
     * Env: none required (Parallelum is public, no API key).
     *
     * NOT IN CI. NOT IN BUILD. This script is exclusively a human-triggered tool.
     */

    import { readFileSync, writeFileSync } from "node:fs";
    import { resolve } from "node:path";

    // Lightweight .env.local loader — kept for parity with scripts/seed-dev.ts
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
          const val = valRaw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
          if (!(key in process.env)) process.env[key] = val;
        }
      } catch {
        // .env.local not found — fine, this script doesn't need secrets
      }
    }

    loadDotEnv();

    const PARALLELUM_URL = "https://parallelum.com.br/fipe/api/v1/carros/marcas";
    const OUTPUT_PATH = resolve(process.cwd(), "src/lib/brasil/fipe-brands-snapshot.json");

    type Marca = { codigo: string; nome: string };

    async function main(): Promise<void> {
      console.log(`Fetching brands from ${PARALLELUM_URL}...`);
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 15_000);
      let brands: Marca[];
      try {
        const res = await fetch(PARALLELUM_URL, { signal: ctrl.signal });
        if (!res.ok) {
          throw new Error(`Parallelum returned HTTP ${res.status}`);
        }
        const body = (await res.json()) as unknown;
        if (!Array.isArray(body)) {
          throw new Error("Parallelum returned non-array body");
        }
        brands = body
          .filter(
            (b): b is Marca =>
              typeof b === "object" &&
              b !== null &&
              typeof (b as { codigo?: unknown }).codigo === "string" &&
              typeof (b as { nome?: unknown }).nome === "string",
          )
          .map((b) => ({ codigo: b.codigo, nome: b.nome }));
      } finally {
        clearTimeout(timeout);
      }

      if (brands.length < 50) {
        throw new Error(`Expected ≥50 brands from Parallelum, got ${brands.length}`);
      }

      // Sort stably by nome for deterministic diffs
      brands.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

      const snapshot = {
        generated_at: new Date().toISOString(),
        source: "parallelum.com.br/fipe/api/v1/carros/marcas",
        brands,
      };

      writeFileSync(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      console.log(`Wrote ${brands.length} brands to ${OUTPUT_PATH}`);
    }

    main().catch((err) => {
      console.error("sync-fipe-brands failed:", err);
      process.exit(1);
    });
    ```

    Key details:
    - Uses native `fetch` (Node 22 — verified in RESEARCH.md Environment Availability).
    - Hits Parallelum DIRECTLY — no runtime dependency on the local `/api/fipe` route (plan 07-03). This is why this plan's `depends_on` is empty and wave is 1.
    - 15s timeout (longer than runtime's 5s — this is manual, network variance tolerated).
    - Sorts brands alphabetically by `nome` with pt-BR locale so `git diff` is stable across runs.
    - Writes with trailing newline to match the JSON file seeded in plan 07-01.
    - Throws if < 50 brands — sanity guard.

    Do NOT add a post-run verification hook. Do NOT modify the CI pipeline. The only way this runs is explicit `pnpm sync:fipe`.
  </action>
  <verify>
    <automated>pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - File `scripts/sync-fipe-brands.ts` exists
    - `grep -n "#!/usr/bin/env tsx" scripts/sync-fipe-brands.ts` returns 1 match on line 1
    - `grep -n "PARALLELUM_URL" scripts/sync-fipe-brands.ts` returns ≥1 match
    - `grep -n "writeFileSync(OUTPUT_PATH" scripts/sync-fipe-brands.ts` returns 1 match
    - `grep -n "brands.sort" scripts/sync-fipe-brands.ts` returns 1 match (stable ordering)
    - `grep -n "brands.length < 50" scripts/sync-fipe-brands.ts` returns 1 match (sanity guard)
    - `grep -n "/api/fipe" scripts/sync-fipe-brands.ts` returns 0 matches (direct Parallelum fetch, no dev-server dep)
    - `pnpm typecheck` exits 0
    - `pnpm lint` exits 0 for the new file
  </acceptance_criteria>
</task>

<task id="07-04-02" type="auto">
  <name>Task 2: Add sync:fipe npm script to package.json</name>
  <files>package.json</files>
  <read_first>
    - package.json (read scripts block — find whether a "seed" script already exists as template pattern)
  </read_first>
  <action>
    Add a new entry to the `"scripts"` object in `package.json`:

    ```json
    "sync:fipe": "tsx scripts/sync-fipe-brands.ts"
    ```

    Place it near other one-off/tooling scripts (e.g., after `"seed"` if it exists, or after `"test"`).

    Do NOT add any hook like `"prebuild"` or `"postinstall"` that would invoke this script.
    Do NOT bump any dependency versions.

    Preserve existing script entries verbatim.
  </action>
  <verify>
    <automated>node -e "const p=require('./package.json'); if(!p.scripts['sync:fipe']) process.exit(1); console.log('sync:fipe =', p.scripts['sync:fipe']);"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "\"sync:fipe\":" package.json` returns exactly 1 match
    - `grep -n "\"sync:fipe\": \"tsx scripts/sync-fipe-brands.ts\"" package.json` returns 1 match
    - `grep -nE "(prebuild|postinstall).*sync-fipe" package.json` returns 0 matches (script is manual-only)
    - `pnpm install --frozen-lockfile` exits 0 (no lockfile changes)
    - All existing scripts preserved: `node -e "console.log(Object.keys(require('./package.json').scripts).length)"` prints a number ≥ N+1 where N is the count before this edit
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `pnpm typecheck && pnpm lint` green
- Dry-run OK: `pnpm sync:fipe` either regenerates snapshot (if Parallelum reachable) OR fails loudly with a timeout/network error (expected if offline). Either outcome is acceptable — the script's purpose is manual invocation, not runtime dep.
- `git status` shows only the two files in this plan modified
</verification>

<success_criteria>
- D-03 manual generator in place
- Script follows scripts/seed-dev.ts idiom (shebang + loadDotEnv + main + catch/exit)
- No CI/build integration — explicit per D-03
- Snapshot file itself is not regenerated by this plan (plan 07-01 seeded it); this plan only provides the future regeneration tool
</success_criteria>

<output>
After completion, create `.planning/phases/07-wishlist-ui/07-04-SUMMARY.md` documenting:
- Script location + invocation command
- That the script was NOT run during this plan (snapshot already seeded by 07-01)
- Note about future maintenance: "run `pnpm sync:fipe` when Parallelum drifts"
- Topology note: this plan stays in wave 1 with empty depends_on because the script hits Parallelum directly (no runtime dep on plan 07-03's /api/fipe route)
</output>
</content>
