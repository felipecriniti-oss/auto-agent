---
slug: fipe-and-chat-reply-errors
status: resolved
trigger: |
  Two bugs reported by user on the main page of the AutoAgent Negotiation Playground:

  Bug 1 — FIPE not resolved automatically when user fills in model + year. POST /api/fipe
  returns not_found. There are uncommitted tentative fixes in src/app/api/fipe/route.ts
  (word-boundary on both sides of regex + parallel fan-out of 20 candidates with partial
  upstream failure tolerance) that were written right before the machine bluescreened
  and were never validated.

  Bug 2 — Negotiation chat errors out when user replies. Second user message triggers
  upstream error. Uncommitted tentative fix in src/lib/server/llm/gemini.ts adds
  permissive safety settings + a synthetic "user" turn prepended when history starts
  with role="model" (history-alternation repair). Also unvalidated.

  The user wants both fixed quickly so they can move to the next GSD phase and then
  UI/UX work. They explicitly asked for parallel agents (one to test, one to fix)
  where it makes sense.
created: 2026-04-19
updated: 2026-04-19
---

# Debug Session: fipe-and-chat-reply-errors

## Symptoms

- **Expected behavior:**
  1. User picks a model + year in the lookup form → /api/fipe returns a FIPE price
     object and the UI displays it automatically.
  2. User starts a negotiation with the bot and replies in chat → each user turn
     gets a streamed agent reply without error.

- **Actual behavior:**
  1. /api/fipe returns `{ error: "not_found" }` (HTTP 404) for combinations the
     user expects to exist (e.g. common marca + modelo + ano).
  2. First agent reply works, but when the user sends their next chat message the
     backend streaming endpoint errors out before returning a response.

- **Error messages:** Not captured by user yet. Need to reproduce and capture
  exact error text from server logs + browser network tab.

- **Timeline:** Introduced during the current in-progress session. Prior to the
  tentative uncommitted fixes, the issues were reproducible; after the fixes the
  code has not been re-tested.

- **Reproduction:**
  - Bug 1: open app, go to lookup, type a common model (e.g. "Gol") + year (e.g.
    2015) → observe 404.
  - Bug 2: complete a lookup, start a negotiation, send a second user message in
    the chat → observe error.

## Current Focus

- **hypothesis:** Resolved. See Evidence + Resolution below.
- **test:** Full vitest suite + real /api/fipe smoke tests against Parallelum.
- **expecting:** Both flows now succeed.
- **next_action:** Commit fixes atomically and ask user before pushing.

## Evidence

- timestamp: 2026-04-19
  scope: bug_a_fipe_route_structure
  note: |
    Uncommitted fix in src/app/api/fipe/route.ts introduced:
    (1) word-boundary regex on both sides (\\bgol\\b), and
    (2) parallel fan-out of up to MAX_MODELO_CANDIDATES=20 trim candidates,
        replacing the sequential walk loop.
    Full test suite (168 tests) passes against the uncommitted HEAD. The regex
    change is tested ("Gol does not swallow Golf"), and the cascade-walk is
    tested with a 2-candidate fixture.

- timestamp: 2026-04-19
  scope: bug_a_real_world_data
  note: |
    Queried Parallelum directly for marca_codigo=59 (Volkswagen). The /modelos
    endpoint returns 546 total modelos; word-boundary filter on "gol" yields
    107 matches (Gol 1.0 Flex, Gol City Trend, Gol Rallye, etc.). Probed a
    sample of the shortest-named Gol variants (codigos 2395, 2396, 2397, 2398,
    2393, 2394, 2409, 2410) and all of them top out in /anos at ≤2009. This
    means the cap of 20 candidates, combined with the nome.length-asc sort,
    systematically excludes every modern-year Gol trim. That's why the user
    saw 404 for "Gol 2015" — the fix is architecturally correct but the cap is
    too tight.

- timestamp: 2026-04-19
  scope: bug_b_primary_provider
  note: |
    src/lib/server/llm/index.ts: resolveProvider() defaults to "anthropic";
    the Gemini adapter is a dev escape hatch. PROJECT-BRIEF §10 locks the
    production LLM to Claude Sonnet 4.6. The uncommitted Gemini fix
    (permissive safety + history alternation repair) does NOT fix Bug B for
    the production code path.

- timestamp: 2026-04-19
  scope: bug_b_root_cause
  note: |
    Traced the full chat data flow:
      1. ChatView's useEffect fires sendToAgent([{role:"user", content:"Início
         da conversa."}]) on status→negotiating. OK.
      2. Backend streams agent reply. appendAgentChunk accumulates a
         Message{role:"agent"}. finalizeAgentMessage marks it done.
      3. The synthetic opener user turn is NEVER persisted in the Zustand
         store — only the agent's reply is.
      4. On user's first chat reply, handleSend calls addSellerMessage, then
         maps store messages → api messages as agent→assistant, seller→user.
         Resulting `messages` sent to backend starts with {role:"assistant"}.
      5. Anthropic's API rejects histories whose first message is not a user
         turn ("messages: first message must be role 'user'"). → Bug B.

- timestamp: 2026-04-19
  scope: fix_validation
  note: |
    Post-fix vitest run: 17 test files / 176 tests pass (was 168 pre-fix).
    New tests:
      - src/lib/server/llm/normalize.test.ts (5): covers the normalizeMessages
        invariant directly.
      - src/app/api/negotiate/stream/route.test.ts: 2 new tests verify the
        Anthropic adapter receives a user-first history even when incoming
        body.messages starts with assistant.
      - src/app/api/fipe/route.test.ts: 1 new test (41 candidates, 2015
        coverage only on the last) confirms we probe past the old 20-cap.
    Live /api/fipe smoke via `pnpm dev`:
      - POST {Volkswagen, Gol, 2015} → 200 {fipe: 44346, modelo: "Gol Rallye
        1.6 T. Flex 16V 5p", ano: 2015}
      - POST {Volkswagen, Gol 1.6, 2015} → 200 (same 44346 Gol Rallye trim)
      - POST {Fiat, Uno, 2018} → 200 {fipe: 41467}
      - POST {Chevrolet, Onix, 2019} → 200 {fipe: 50031}

## Eliminated

- The marca-side fuzzy match was NOT the problem. "Volkswagen" correctly
  matches "VW - VolksWagen" via \\bvolkswagen\\b because the Parallelum name
  contains the full token as a standalone word.
- The year-prefix filter (`codigo.startsWith("2015-")`) was NOT the problem;
  Parallelum's /anos responses conform to the `${year}-${fuel}` codigo shape.
- The Gemini adapter's uncommitted safety-settings + history-alternation
  changes are orthogonal to Bug B (production uses Anthropic). They remain
  useful for the dev-only Gemini path but do not resolve the user-facing bug.

## Resolution

- **root_cause:**
  - Bug A: MAX_MODELO_CANDIDATES=20 was too tight. For popular marca+modelo
    pairs (e.g. Volkswagen + Gol, which produces 107 boundary hits), the
    nome.length-asc sort biases the top 20 toward discontinued 1990s/2000s
    trims whose /anos top out pre-2010. A request for a recent ano (e.g.
    2015) found no match in the first 20 probes and returned 404 even
    though the full list contains matching trims.
  - Bug B: Anthropic's Messages API requires the first message to have
    role="user". The negotiation frontend does not persist the synthetic
    opener user turn — only the agent's streamed reply is stored. So on
    round 2, the mapped `messages` sent to /api/negotiate/stream starts with
    role="assistant", which Anthropic rejects with an upstream error.

- **fix:**
  - Bug A: raise MAX_MODELO_CANDIDATES from 20 → 120 in
    src/app/api/fipe/route.ts. 120 is a safe band covering every realistic
    marca's modelo set (VW = 546 total / 107 Gol-matching; other marcas are
    smaller) without saturating Parallelum with thousands of concurrent
    fetches. The word-boundary regex + parallel fan-out from the uncommitted
    fix are kept as-is; they are correct.
  - Bug B: add `normalizeMessages()` in src/lib/server/llm/index.ts. When
    messages[0].role !== "user", prepend a synthetic
    {role:"user", content:"Início da conversa."} turn. `streamLLM` applies
    the normalizer unconditionally before dispatching to either provider
    adapter, so the invariant holds for Anthropic AND Gemini. Removed the
    duplicate alternation-repair block from gemini.ts (now dead code).
    Safety settings + assistant→model mapping in gemini.ts are kept.

- **verification:**
  - Full vitest suite: 17 files / 176 tests pass.
  - TypeScript strict: `pnpm tsc --noEmit` clean.
  - Biome lint: clean on all modified files.
  - Live end-to-end smoke against Parallelum: 3/3 queries resolved (see
    fix_validation evidence row).
  - Pending manual validation by user: browser-level second-turn chat
    (cannot be exercised without a live ANTHROPIC_API_KEY — the new route
    test verifies the wire-format invariant using a mocked Anthropic SDK).
