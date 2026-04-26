#!/usr/bin/env tsx
/**
 * setup-apify-schedule.ts — Phase 8 schedule-sync script.
 *
 * Purpose:
 *   Idempotently create or update the Apify schedule that drives WebMotors
 *   scraping. Without this script, the schedule + actor input config lives
 *   only inside the Apify dashboard (NOT in git) — a single dashboard reset
 *   would silently break production. With it, redeploying the schedule is
 *   one command.
 *
 * Usage:
 *   pnpm tsx scripts/setup-apify-schedule.ts <env>     # env = dev | prod
 *   # or, to load .env.local automatically:
 *   pnpm dotenv -e .env.local -- pnpm tsx scripts/setup-apify-schedule.ts <env>
 *
 * Env vars (all read from process.env, never echoed by the script):
 *   APIFY_API_TOKEN          required — the Apify account that owns the schedule
 *   SCRAPE_WEBHOOK_SECRET    required — only its NAME is mentioned in stdout
 *                                       so the developer remembers to paste it
 *                                       into the Apify dashboard webhook config.
 *                                       The actual VALUE is never printed.
 *   WEBHOOK_BASE_URL         optional — overrides the default per-env target.
 *                                       Defaults: dev → http://localhost:3000
 *                                                  prod → https://autoagente.ai
 *
 * Behavior:
 *   1. Lists existing schedules via GET /v2/schedules.
 *   2. Looks up by exact name (`autoagent-webmotors-{env}`).
 *   3. POST a new one if missing, PUT-updates the existing one if found.
 *   4. Prints the dashboard webhook config the developer must add by hand
 *      (Apify webhook header templates aren't covered by /v2/schedules).
 *   5. Token-scrub: every console output and thrown error is passed through
 *      a regex-replace that scrubs APIFY_API_TOKEN to "[REDACTED]".
 *
 * Idempotency:
 *   Safe to re-run. PUT-by-name preserves existing schedule id; only one
 *   schedule per env name ever exists in the account. Cron + timezone +
 *   startUrls are overwritten from this file's source-of-truth values.
 *
 * No npm dependencies — pure built-in fetch + ESM.
 */

import { TARGET_MODELS } from "../src/lib/apify/target-models";

// ─── Constants ─────────────────────────────────────────────────────────

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR = "ribtools~webmotors-scraper";
const TIMEZONE = "America/Sao_Paulo";

const SCHEDULE_NAMES = {
  dev: "autoagent-webmotors-dev",
  prod: "autoagent-webmotors-prod",
} as const;

// D-03 (locked in CONTEXT.md): cron cadence per env.
const CRON = {
  dev: "0 3 * * *", // 03:00 BRT — 1 run/day
  prod: "0 2,14 * * *", // 02:00 + 14:00 BRT — 2 runs/day
} as const;

const DEFAULT_WEBHOOK_BASE_URL = {
  dev: "http://localhost:3000",
  prod: "https://autoagente.ai",
} as const;

const MAX_ITEMS_PER_RUN = 2000;

const HTTP_TIMEOUT_MS = 30_000;

type Env = "dev" | "prod";

// ─── Token-scrub helper ────────────────────────────────────────────────

/**
 * Scrub APIFY_API_TOKEN from any string before printing or throwing.
 * Same discipline as scripts/probe-apify-tier.ts and the webhook route.
 */
function scrub(value: unknown, token: string): string {
  return String(value).replace(new RegExp(token, "g"), "[REDACTED]");
}

function logOut(message: string, token: string): void {
  // biome-ignore lint/suspicious/noConsole: setup script — stdout is the contract.
  console.log(scrub(message, token));
}

function logErr(message: string, token: string): void {
  // biome-ignore lint/suspicious/noConsole: setup script — stderr surfaces failures.
  console.error(scrub(message, token));
}

// ─── Apify REST shapes ─────────────────────────────────────────────────

interface ApifySchedule {
  id: string;
  name: string;
  cronExpression: string;
  timezone: string;
  isEnabled: boolean;
  actions?: unknown[];
}

interface ApifyListEnvelope<T> {
  data: { items: T[]; total?: number; count?: number };
}

interface ApifyItemEnvelope<T> {
  data: T;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function parseEnvArg(): Env {
  const arg = process.argv[2];
  if (arg !== "dev" && arg !== "prod") {
    // No token in scope yet — hardcoded message contains no secrets.
    // biome-ignore lint/suspicious/noConsole: setup script — usage message.
    console.error(
      "Usage: pnpm tsx scripts/setup-apify-schedule.ts <env>\n  <env> must be 'dev' or 'prod'",
    );
    process.exit(2);
  }
  return arg;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    // biome-ignore lint/suspicious/noConsole: setup script — surface missing-env hard failure.
    console.error(`MISSING ${name}`);
    process.exit(2);
  }
  return value;
}

async function listSchedules(token: string): Promise<ApifySchedule[]> {
  const url = `${APIFY_BASE}/schedules?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    const rawBody = await res.text().catch(() => "");
    throw new Error(`apify_list_${res.status}: ${rawBody.slice(0, 400)}`);
  }
  const json = (await res.json()) as ApifyListEnvelope<ApifySchedule>;
  return json.data?.items ?? [];
}

async function createSchedule(
  token: string,
  body: Record<string, unknown>,
): Promise<ApifySchedule> {
  const url = `${APIFY_BASE}/schedules?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    const rawBody = await res.text().catch(() => "");
    throw new Error(`apify_create_${res.status}: ${rawBody.slice(0, 400)}`);
  }
  const json = (await res.json()) as ApifyItemEnvelope<ApifySchedule>;
  return json.data;
}

async function updateSchedule(
  token: string,
  scheduleId: string,
  body: Record<string, unknown>,
): Promise<ApifySchedule> {
  const url = `${APIFY_BASE}/schedules/${encodeURIComponent(scheduleId)}?token=${encodeURIComponent(
    token,
  )}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    const rawBody = await res.text().catch(() => "");
    throw new Error(`apify_update_${res.status}: ${rawBody.slice(0, 400)}`);
  }
  const json = (await res.json()) as ApifyItemEnvelope<ApifySchedule>;
  return json.data;
}

function buildScheduleBody(env: Env): Record<string, unknown> {
  const startUrls = TARGET_MODELS.map((m) => ({ url: m.url }));
  return {
    name: SCHEDULE_NAMES[env],
    cronExpression: CRON[env],
    timezone: TIMEZONE,
    isEnabled: true,
    actions: [
      {
        type: "RUN_ACTOR",
        actorId: ACTOR,
        runInput: {
          startUrls,
          maxItems: MAX_ITEMS_PER_RUN,
          proxyConfiguration: {
            useApifyProxy: true,
            apifyProxyGroups: ["RESIDENTIAL"],
          },
        },
      },
    ],
  };
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const env = parseEnvArg();
  const token = requireEnv("APIFY_API_TOKEN");
  // SCRAPE_WEBHOOK_SECRET is required to be SET so the developer can't run
  // this script without having generated the secret yet — but its VALUE is
  // never read into a variable that gets printed. We only verify presence.
  // biome-ignore lint/correctness/noUnusedVariables: presence-check only; value never used.
  const _scrapeWebhookSecretIsSet = requireEnv("SCRAPE_WEBHOOK_SECRET");

  const webhookBaseUrl = process.env.WEBHOOK_BASE_URL ?? DEFAULT_WEBHOOK_BASE_URL[env];
  const scheduleName = SCHEDULE_NAMES[env];
  const cron = CRON[env];

  logOut(
    `Syncing Apify schedule: name=${scheduleName} cron="${cron}" tz=${TIMEZONE} actor=${ACTOR}`,
    token,
  );
  logOut(`startUrls: ${TARGET_MODELS.length} target models`, token);

  // 1. Look up existing schedule by name.
  const existing = await listSchedules(token);
  const match = existing.find((s) => s.name === scheduleName);

  // 2. Build the request body.
  const body = buildScheduleBody(env);

  // 3. POST or PUT.
  let result: ApifySchedule;
  if (match) {
    logOut(`Found existing schedule id=${match.id} — updating in place...`, token);
    result = await updateSchedule(token, match.id, body);
  } else {
    logOut(`No existing schedule named "${scheduleName}" — creating...`, token);
    result = await createSchedule(token, body);
  }

  // 4. Echo the resulting schedule for audit (token-scrubbed by JSON.stringify
  //    of a structure that does not contain the token — defense-in-depth).
  logOut("Schedule synced. Apify response:", token);
  logOut(JSON.stringify(result, null, 2), token);

  // 5. Print the dashboard webhook config block. The script CANNOT automate
  //    this step because Apify dashboard's headers-template UI is the only
  //    surface that supports the X-AutoAgent-Webhook-Secret pattern Phase 8
  //    relies on. The actual SCRAPE_WEBHOOK_SECRET value is NEVER echoed —
  //    only the placeholder text. Developer copies from .env.local manually.
  const dashboardUrl = `https://console.apify.com/schedules/${result.id}`;
  const webhookUrl = `${webhookBaseUrl}/api/scrape/webmotors/webhook`;
  logOut(
    [
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "Schedule synced. Now configure the webhook in the Apify dashboard:",
      "",
      `  1. Open ${dashboardUrl}/webhooks`,
      '  2. Click "Add webhook"',
      "  3. Event types: ACTOR.RUN.SUCCEEDED  (only — do NOT enable FAILED/ABORTED)",
      `  4. Request URL: ${webhookUrl}`,
      "  5. Headers (JSON template):",
      "       {",
      '         "Content-Type": "application/json",',
      '         "X-AutoAgent-Webhook-Secret": "<paste your SCRAPE_WEBHOOK_SECRET>"',
      "       }",
      "  6. Save",
      "",
      "The actual secret value is NOT printed by this script. Copy it from your",
      "  .env.local file (or password manager) and paste into the dashboard.",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
    ].join("\n"),
    token,
  );
}

main().catch((err) => {
  const token = process.env.APIFY_API_TOKEN ?? "";
  if (token) {
    logErr(`FAILED: ${String(err)}`, token);
  } else {
    // biome-ignore lint/suspicious/noConsole: setup script — stderr surfaces failures.
    console.error(`FAILED: ${String(err)}`);
  }
  process.exit(1);
});
