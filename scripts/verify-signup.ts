#!/usr/bin/env tsx
/**
 * verify-signup.ts — end-to-end test that signup actually writes to public.users.
 *
 * What it does (with cleanup):
 *   1. Admin-creates a test auth user via service role.
 *   2. Reads public.users to confirm the trigger `handle_new_auth_user`
 *      auto-inserted the profile row.
 *   3. Verifies id + email match between auth.users and public.users.
 *   4. Deletes the test auth user (cascades to public.users via FK).
 *
 * Usage:
 *   pnpm tsx scripts/verify-signup.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env.local missing — rely on real env
  }
}
loadDotEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main(): Promise<void> {
  const testEmail = `verify-signup-${timestamp()}@test.autoagente.local`;
  const testPassword = "correct horse battery staple 8+";

  console.log(`Test email: ${testEmail}`);

  // 1. Create auth user
  console.log("→ 1. Creating auth user via admin API...");
  const createStart = Date.now();
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  });
  if (createErr) {
    console.error("   ✗ FAIL — could not create user:", createErr.message);
    process.exit(1);
  }
  const authUser = created.user;
  if (!authUser) {
    console.error("   ✗ FAIL — user object missing in response");
    process.exit(1);
  }
  console.log(`   ✓ ok (${Date.now() - createStart}ms) — auth user id: ${authUser.id}`);

  // 2. Small delay so the trigger has time to run (usually instant, belt-and-suspenders)
  await new Promise((r) => setTimeout(r, 200));

  // 3. Read public.users row
  console.log("→ 2. Reading public.users (expect trigger-created row)...");
  const { data: profile, error: readErr } = await sb
    .from("users")
    .select("id, email, plan, role, onboarding_complete, created_at")
    .eq("id", authUser.id)
    .maybeSingle();

  if (readErr) {
    console.error("   ✗ FAIL — select error:", readErr.message);
    await cleanup(authUser.id);
    process.exit(1);
  }
  if (!profile) {
    console.error(
      "   ✗ FAIL — no row in public.users. Trigger handle_new_auth_user did not fire or failed silently.",
    );
    await cleanup(authUser.id);
    process.exit(1);
  }
  console.log("   ✓ ok — profile row exists");
  console.log("     ", profile);

  // 4. Assertions
  console.log("→ 3. Verifying field integrity...");
  const checks: Array<{ name: string; pass: boolean; got: unknown; expected?: unknown }> = [
    { name: "id matches auth.users.id", pass: profile.id === authUser.id, got: profile.id },
    {
      // Supabase Auth lowercases emails at storage (per RFC practice) — compare accordingly.
      name: "email matches (case-insensitive)",
      pass: profile.email?.toLowerCase() === testEmail.toLowerCase(),
      got: profile.email,
      expected: testEmail.toLowerCase(),
    },
    {
      name: "default plan = 'starter'",
      pass: profile.plan === "starter",
      got: profile.plan,
    },
    {
      name: "default role = 'lojista'",
      pass: profile.role === "lojista",
      got: profile.role,
    },
    {
      name: "onboarding_complete = false by default",
      pass: profile.onboarding_complete === false,
      got: profile.onboarding_complete,
    },
    {
      name: "created_at populated",
      pass: typeof profile.created_at === "string" && profile.created_at.length > 0,
      got: profile.created_at,
    },
  ];
  let allPass = true;
  for (const c of checks) {
    console.log(
      `   ${c.pass ? "✓" : "✗"} ${c.name} ${c.pass ? "" : `(got=${JSON.stringify(c.got)}${c.expected !== undefined ? `, expected=${JSON.stringify(c.expected)}` : ""})`}`,
    );
    if (!c.pass) allPass = false;
  }

  // 5. Cleanup
  console.log("→ 4. Cleaning up test user...");
  await cleanup(authUser.id);

  // Verify cleanup
  const { data: gone } = await sb
    .from("users")
    .select("id")
    .eq("id", authUser.id)
    .maybeSingle();
  if (gone) {
    console.warn("   ⚠ cleanup incomplete — public.users row still present");
  } else {
    console.log("   ✓ public.users row removed (cascade)");
  }

  if (allPass) {
    console.log("\n✅ PASS — signup flow writes to DB correctly.");
    process.exit(0);
  } else {
    console.log("\n❌ FAIL — one or more assertions failed. See output above.");
    process.exit(1);
  }
}

async function cleanup(userId: string): Promise<void> {
  const { error } = await sb.auth.admin.deleteUser(userId);
  if (error) {
    console.warn(`   ⚠ deleteUser error: ${error.message}`);
  } else {
    console.log("   ✓ auth user deleted");
  }
}

main().catch((err) => {
  console.error("Unexpected failure:", err);
  process.exit(1);
});
