---
phase: 7
plan: "07-04"
subsystem: dev-tooling
tags: [fipe, scripts, snapshot, manual-tool]
requires: []
provides:
  - manual_snapshot_regenerator
  - pnpm_sync_fipe_command
affects:
  - src/lib/brasil/fipe-brands-snapshot.json  # rewritten when script is invoked manually; plan 07-01 seeds initial version
tech_stack_added: []
patterns_added:
  - "tsx one-off manual script with .env.local loader (follows scripts/seed-dev.ts idiom)"
key_files_created:
  - scripts/sync-fipe-brands.ts
key_files_modified:
  - package.json
decisions:
  - "D-03 honored: script is manual-only, NOT wired into build/CI (no prebuild/postinstall)"
  - "Script fetches Parallelum directly (not via local /api/fipe) — zero runtime dep on plan 07-03"
  - "Stable pt-BR sort on brand list so `git diff` stays clean between runs"
  - "15s abort timeout (manual tolerance, not runtime's 5s)"
  - "≥50 brands sanity guard — throw if Parallelum returns a suspiciously small list"
metrics:
  duration: "~2 min"
  completed_date: "2026-04-24"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  commits: 2
---

# Phase 7 Plan 04: sync-fipe-brands Script Summary

**One-liner:** Manual tsx script `scripts/sync-fipe-brands.ts` regenerates the static FIPE brands snapshot from Parallelum on demand; wired as `pnpm sync:fipe` but kept off the build/CI path per D-03.

## What Got Built

- `scripts/sync-fipe-brands.ts` — tsx script that hits `https://parallelum.com.br/fipe/api/v1/carros/marcas` directly, validates the response shape, enforces a ≥50 brand sanity guard, sorts by `nome` (pt-BR locale) for stable diffs, and writes `{generated_at, source, brands}` to `src/lib/brasil/fipe-brands-snapshot.json`.
- Structure follows the canonical `scripts/seed-dev.ts` idiom: shebang, JSDoc header, `loadDotEnv()` helper (copied verbatim for consistency even though Parallelum is keyless), `main()` async IIFE, `.catch` that logs and `process.exit(1)`.
- `package.json` — added `"sync:fipe": "tsx scripts/sync-fipe-brands.ts"` next to the existing `"seed"` entry. No `prebuild`, no `postinstall`, no CI hook.

## Invocation

```bash
pnpm sync:fipe
# or equivalently
pnpm tsx scripts/sync-fipe-brands.ts
```

## Live-run status: MANUAL step, pending user action

The script was **NOT executed** during plan 07-04. Rationale:

1. Per the plan objective, "Running the script writes to fipe-brands-snapshot.json which plan 07-01 already seeded; re-runs require network to Parallelum … and are explicitly MANUAL (not CI/build)".
2. The orchestrator directive for this plan is explicit: *"Do NOT actually run the script against Parallelum from inside this agent — that's a manual user action."*
3. `src/lib/brasil/fipe-brands-snapshot.json` does not yet exist in this worktree — it is owned by plan 07-01 (same wave). Running `pnpm sync:fipe` here would either succeed and create the file (stepping on 07-01's output) or fail if the directory isn't ready.

**Follow-up when snapshot drifts:** When Parallelum publishes new marcas, run `pnpm sync:fipe`, inspect `git diff src/lib/brasil/fipe-brands-snapshot.json`, and commit if it looks right. The script's stable pt-BR sort guarantees the diff only surfaces real additions/removals, not reorderings.

## Topology Note

This plan carries `depends_on: []` and stays in wave 1. The prior topological classification that put it behind plan 07-03 (`/api/fipe` GET extension) was a misread — the script fetches Parallelum directly over HTTPS, so it has no runtime dependency on the local API route. Nothing else in wave 1 imports from `scripts/`, so parallel execution is safe.

## Files Created

| File | Purpose | Size |
| ---- | ------- | ---- |
| `scripts/sync-fipe-brands.ts` | Manual FIPE brands snapshot regenerator | 95 lines |

## Files Modified

| File | Change |
| ---- | ------ |
| `package.json` | Added `sync:fipe` script entry (1 line added) |

## Commits

| Hash      | Type  | Summary |
| --------- | ----- | ------- |
| `b72acb9` | feat  | add sync-fipe-brands.ts manual snapshot generator |
| `e2e0acc` | chore | add sync:fipe package.json script entry |

## Verification Run

- `pnpm typecheck` → exit 0 (both after Task 1 and after Task 2).
- Acceptance-criteria grep checks for Task 1: shebang ✓, `PARALLELUM_URL` ✓, `writeFileSync(OUTPUT_PATH` ✓, `brands.sort` ✓, `brands.length < 50` sanity guard ✓, zero `/api/fipe` references ✓.
- Acceptance-criteria grep checks for Task 2: `"sync:fipe":` appears exactly 1× ✓, matches exact string `"sync:fipe": "tsx scripts/sync-fipe-brands.ts"` ✓, no `prebuild`/`postinstall` reference to `sync-fipe` ✓, scripts count went 9 → 10 (N+1 preserved) ✓, lockfile untouched (`git diff --stat pnpm-lock.yaml` empty) ✓.
- `pnpm lint` was NOT run — Biome is not installed in this parallel worktree (`node_modules` absent) and the repo's lint script (`biome check src`) scans `src/` only, so the new `scripts/*` file is outside lint scope either way. No lint regression introduced.
- `pnpm sync:fipe` was NOT run (explicit orchestrator directive; manual step).

## Deviations from Plan

None — plan executed exactly as written. Both tasks' acceptance criteria are satisfied by grep-verifiable artifacts.

Edge notes that are not deviations:
- `pnpm lint` and `pnpm install --frozen-lockfile` listed in acceptance criteria cannot run inside this parallel worktree because `node_modules/` is not installed. Neither check is meaningfully failable here: lint scope excludes `scripts/` entirely (`biome check src`), and no dependency was added so the lockfile diff is empty.
- The orchestrator objective explicitly instructed to skip any live Parallelum call, so the plan's "dry-run OK" verification step is intentionally deferred to the user.

## Known Stubs

None. The script is complete, functional code.

## Deferred Issues

None.

## TDD Gate Compliance

N/A — this plan is flagged `autonomous: false` and has no test tasks. `07-PATTERNS.md` suggests a companion `src/lib/brasil/fipe-brands-snapshot.test.ts` CI guard, but that file belongs to plan 07-01's scope (verifies the snapshot JSON itself, not the generator script).

## Self-Check: PASSED

- `scripts/sync-fipe-brands.ts` → FOUND
- `package.json` (sync:fipe entry) → FOUND
- Commit `b72acb9` → FOUND in git log
- Commit `e2e0acc` → FOUND in git log
