#!/usr/bin/env tsx
/**
 * probe-apify-tier.ts — Phase 8 Wave 0 BLOCKER probe.
 *
 * Purpose:
 *   Verify the user's APIFY_API_TOKEN belongs to a Starter+ Apify account that
 *   has RESIDENTIAL proxy access. Free-tier accounts silently fail every run
 *   against WebMotors (Akamai blocks Apify datacenter IPs) — Phase 8's entire
 *   scheduled-pipeline assumption depends on residential proxy availability.
 *
 *   Open Question A1 from RESEARCH.md must be GO|HALT before plan 02 runs.
 *
 * Cost:
 *   Running this script consumes a small Apify credit (~$0.01 USD). It starts
 *   exactly ONE actor run with MAX_ITEMS=10 against a single brand+model URL,
 *   waits at most 3 minutes, then exits. Re-runnable safely.
 *
 * Output (stdout):
 *   - "RESULT: GO"   — account has residential proxy access; Phase 8 may proceed.
 *   - "RESULT: HALT" — free tier OR run failure. Phase 8 is BLOCKED.
 *
 * Token discipline:
 *   APIFY_API_TOKEN is read from env only. Every console output and thrown
 *   error is passed through a regex-replace that scrubs the token to
 *   "[REDACTED]" before printing. No npm dependencies — uses built-in fetch.
 *
 * Usage:
 *   pnpm tsx scripts/probe-apify-tier.ts
 *   # or, to load .env.local:
 *   pnpm dotenv -e .env.local -- pnpm tsx scripts/probe-apify-tier.ts
 */

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR = "ribtools~webmotors-scraper";
const TEST_URL = "https://www.webmotors.com.br/carros/estoque?marca=honda&modelo=civic";
const MAX_ITEMS = 10;
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 180_000;

// ─── Token-scrub helper ────────────────────────────────────────────

/**
 * Scrub the APIFY_API_TOKEN from any string before printing or throwing.
 * Mirrors the discipline at src/app/api/scrape/webmotors/route.ts:215-216.
 */
function scrub(value: unknown, token: string): string {
  return String(value).replace(new RegExp(token, "g"), "[REDACTED]");
}

function logOut(message: string, token: string): void {
  // biome-ignore lint/suspicious/noConsole: probe script — stdout is the contract.
  console.log(scrub(message, token));
}

function logErr(message: string, token: string): void {
  // biome-ignore lint/suspicious/noConsole: probe script — stderr surfaces failures.
  console.error(scrub(message, token));
}

// ─── Apify REST shapes ─────────────────────────────────────────────

type ApifyRunStatus =
  | "RUNNING"
  | "READY"
  | "SUCCEEDED"
  | "FAILED"
  | "ABORTED"
  | "TIMING-OUT"
  | "TIMED-OUT";

interface ApifyRunData {
  id: string;
  status: ApifyRunStatus;
  defaultDatasetId: string;
  usageTotalUsd?: number | null;
  statusMessage?: string | null;
  startedAt?: string;
  finishedAt?: string | null;
}

interface ApifyRunEnvelope {
  data: ApifyRunData;
}

// ─── Helpers ───────────────────────────────────────────────────────

function isFreeTierSignal(status: number, bodyText: string): boolean {
  if (status !== 402 && status !== 403) return false;
  const lower = bodyText.toLowerCase();
  return (
    lower.includes("residential") ||
    lower.includes("plan") ||
    lower.includes("upgrade")
  );
}

function isTerminalStatus(status: ApifyRunStatus): boolean {
  return (
    status === "SUCCEEDED" ||
    status === "FAILED" ||
    status === "ABORTED" ||
    status === "TIMED-OUT"
  );
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// ─── Main ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    // Cannot use scrub() yet — no token to scrub against. Hardcoded message
    // contains no secrets.
    // biome-ignore lint/suspicious/noConsole: probe script — stderr surfaces failures.
    console.error("MISSING APIFY_API_TOKEN");
    process.exit(2);
  }

  // Wall-clock budget for the entire probe (POST + polling + dataset fetch).
  const overallController = new AbortController();
  const overallTimer = setTimeout(() => {
    overallController.abort();
  }, TIMEOUT_MS);

  try {
    // ─── Step 1: POST to start the run ────────────────────────────────
    const startUrl = `${APIFY_BASE}/acts/${ACTOR}/runs?token=${encodeURIComponent(token)}`;
    const requestBody = {
      startUrls: [{ url: TEST_URL }],
      maxItems: MAX_ITEMS,
      proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
    };

    let postRes: Response;
    try {
      postRes = await fetch(startUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      logErr(`RESULT: HALT — failed to reach Apify REST: ${String(err)}`, token);
      process.exit(1);
    }

    if (!postRes.ok) {
      const rawBody = await postRes.text().catch(() => "");
      const sanitized = scrub(rawBody, token);
      if (isFreeTierSignal(postRes.status, sanitized)) {
        logOut(
          "RESULT: HALT — account does not have residential proxy access",
          token,
        );
        logErr(
          `apify_${postRes.status}: ${sanitized.slice(0, 400)}`,
          token,
        );
        process.exit(1);
      }
      logOut(
        `RESULT: HALT — Apify POST returned ${postRes.status}`,
        token,
      );
      logErr(`apify_${postRes.status}: ${sanitized.slice(0, 400)}`, token);
      process.exit(1);
    }

    const postJson = (await postRes.json()) as ApifyRunEnvelope;
    const runId = postJson.data?.id;
    const defaultDatasetId = postJson.data?.defaultDatasetId;
    if (!runId || !defaultDatasetId) {
      logOut(
        "RESULT: HALT — Apify response missing runId or defaultDatasetId",
        token,
      );
      process.exit(1);
    }

    logOut(`Started run runId=${runId}`, token);

    // ─── Step 2: Poll until terminal status or wall-clock timeout ────
    const startedAt = Date.now();
    let lastRun: ApifyRunData | null = null;

    while (true) {
      if (Date.now() - startedAt > TIMEOUT_MS) {
        logOut("RESULT: HALT — run did not complete within 3 minutes", token);
        process.exit(1);
      }

      try {
        await sleep(POLL_INTERVAL_MS, overallController.signal);
      } catch {
        logOut("RESULT: HALT — run did not complete within 3 minutes", token);
        process.exit(1);
      }

      const pollUrl = `${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`;
      let pollRes: Response;
      try {
        pollRes = await fetch(pollUrl, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(POLL_INTERVAL_MS * 2),
        });
      } catch (err) {
        logErr(`poll_error: ${String(err)}`, token);
        continue;
      }

      if (!pollRes.ok) {
        const rawBody = await pollRes.text().catch(() => "");
        logErr(
          `poll_${pollRes.status}: ${scrub(rawBody, token).slice(0, 300)}`,
          token,
        );
        continue;
      }

      const pollJson = (await pollRes.json()) as ApifyRunEnvelope;
      lastRun = pollJson.data;
      if (!lastRun) {
        logErr("poll returned empty data envelope", token);
        continue;
      }

      if (isTerminalStatus(lastRun.status)) {
        break;
      }
      // Still RUNNING / READY / TIMING-OUT — loop.
    }

    // ─── Step 3: Inspect terminal status ──────────────────────────────
    if (lastRun.status === "SUCCEEDED") {
      // Fetch dataset to count items.
      const datasetUrl =
        `${APIFY_BASE}/datasets/${encodeURIComponent(defaultDatasetId)}` +
        `/items?clean=true&limit=10&token=${encodeURIComponent(token)}`;
      let itemCount = 0;
      try {
        const dsRes = await fetch(datasetUrl, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(POLL_INTERVAL_MS * 2),
        });
        if (dsRes.ok) {
          const items = (await dsRes.json()) as unknown;
          if (Array.isArray(items)) {
            itemCount = items.length;
          }
        } else {
          const rawBody = await dsRes.text().catch(() => "");
          logErr(
            `dataset_${dsRes.status}: ${scrub(rawBody, token).slice(0, 300)}`,
            token,
          );
        }
      } catch (err) {
        logErr(`dataset_fetch_error: ${String(err)}`, token);
      }

      const usage =
        lastRun.usageTotalUsd === undefined || lastRun.usageTotalUsd === null
          ? "null"
          : String(lastRun.usageTotalUsd);
      const message =
        lastRun.statusMessage === undefined || lastRun.statusMessage === null
          ? ""
          : String(lastRun.statusMessage);

      logOut(
        [
          "RESULT: GO",
          "status=SUCCEEDED",
          `itemCount=${itemCount}`,
          `usageTotalUsd=${usage}`,
          `statusMessage=${message}`,
        ].join("\n"),
        token,
      );
      process.exit(0);
    }

    // FAILED / ABORTED / TIMED-OUT — HALT.
    const message =
      lastRun.statusMessage === undefined || lastRun.statusMessage === null
        ? "(no statusMessage)"
        : String(lastRun.statusMessage);
    logOut(
      [
        "RESULT: HALT",
        `status=${lastRun.status}`,
        `statusMessage=${message}`,
      ].join("\n"),
      token,
    );
    process.exit(1);
  } finally {
    clearTimeout(overallTimer);
  }
}

main().catch((err) => {
  const token = process.env.APIFY_API_TOKEN ?? "";
  if (token) {
    logErr(`RESULT: HALT — uncaught error: ${String(err)}`, token);
  } else {
    // biome-ignore lint/suspicious/noConsole: probe script — stderr surfaces failures.
    console.error(`RESULT: HALT — uncaught error: ${String(err)}`);
  }
  process.exit(1);
});
