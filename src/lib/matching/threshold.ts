/**
 * Single source of truth for the match-score threshold (D-08).
 *
 * Both the webhook handler (src/app/api/scrape/webmotors/webhook/route.ts) and
 * the backfill endpoint (src/app/api/match/backfill/route.ts) consume this so
 * the threshold cannot drift between code paths.
 *
 * Override at runtime via process.env.MATCH_SCORE_THRESHOLD (must parse to a
 * finite number in [0, 1]; otherwise the default applies).
 *
 * Exposed as a function (not a const) so env-var changes between requests are
 * honored on each call — important for serverless invocations where the
 * module is loaded once but env can be updated between deploys without a
 * cold-start, and for tests that override the env per test case.
 */

export const DEFAULT_MATCH_SCORE_THRESHOLD = 0.7;

export function getMatchScoreThreshold(): number {
  const raw = process.env.MATCH_SCORE_THRESHOLD;
  if (typeof raw !== "string" || raw.length === 0) {
    return DEFAULT_MATCH_SCORE_THRESHOLD;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    return DEFAULT_MATCH_SCORE_THRESHOLD;
  }
  return n;
}
