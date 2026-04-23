#!/usr/bin/env tsx
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (!(k in process.env)) process.env[k] = v;
}

async function main(): Promise<void> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  const { data: users } = await sb.auth.admin.listUsers();
  console.log(`\n=== auth.users (${users.users.length}) ===`);
  for (const u of users.users) {
    console.log(
      `  ${u.email} | id=${u.id} | confirmed=${u.email_confirmed_at ?? "no"} | created=${u.created_at}`,
    );
  }

  const { data: profiles } = await sb
    .from("users")
    .select("id, email, name, company_name, city, uf, onboarding_complete, plan, created_at")
    .order("created_at", { ascending: false });

  console.log(`\n=== public.users (${profiles?.length ?? 0}) ===`);
  for (const p of profiles ?? []) {
    console.log(
      `  ${p.email} | name=${p.name ?? "∅"} | city=${p.city ?? "∅"}/${p.uf ?? "∅"} | onboarding_complete=${p.onboarding_complete} | plan=${p.plan}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
