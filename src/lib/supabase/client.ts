/**
 * Browser-side Supabase client (singleton). Uses anon key + cookie-based auth
 * via @supabase/ssr so sessions survive SSR and client navigations.
 *
 * Usage (client components only):
 *   import { getSupabaseBrowser } from "@/lib/supabase/client";
 *   const supabase = getSupabaseBrowser();
 */

import type { Database } from "@/types/database";
import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseEnv } from "./env";

let cachedClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getSupabaseBrowser() {
  if (cachedClient) return cachedClient;
  const { url, anonKey } = requireSupabaseEnv();
  cachedClient = createBrowserClient<Database>(url, anonKey);
  return cachedClient;
}
