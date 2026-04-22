/**
 * Server-side Supabase clients.
 *
 * - `getSupabaseServer()` — reads/writes cookies via next/headers; used inside
 *   Server Components and Route Handlers. Respects RLS as the authenticated
 *   user.
 *
 * - `getSupabaseServiceRole()` — service role key; bypasses RLS entirely.
 *   Use ONLY from:
 *     - Route Handlers that perform cross-tenant operations (scraper ingest,
 *       agent loop edge functions, webhooks).
 *     - Admin scripts.
 *   Never import from client components.
 */

import type { Database } from "@/types/database";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { requireSupabaseEnv, requireSupabaseServiceRole } from "./env";

export async function getSupabaseServer() {
  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't set cookies — middleware handles that path.
        }
      },
    },
  });
}

/**
 * Service-role client. Server-only. Bypasses RLS.
 */
export function getSupabaseServiceRole() {
  const { url, serviceRoleKey } = requireSupabaseServiceRole();
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
