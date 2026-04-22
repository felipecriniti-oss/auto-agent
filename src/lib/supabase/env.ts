/**
 * Supabase env var access with friendly error messages when the project hasn't
 * been provisioned yet. Phases 6+ require these — for now they may be absent,
 * in which case clients fall back to safe no-op behavior (see `isSupabaseConfigured`).
 */

export const supabaseEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
} as const;

export function isSupabaseConfigured(): boolean {
  return supabaseEnv.url.length > 0 && supabaseEnv.anonKey.length > 0;
}

export function requireSupabaseEnv(): { url: string; anonKey: string } {
  if (!supabaseEnv.url || !supabaseEnv.anonKey) {
    throw new Error(
      "Supabase env missing. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local. See MORNING.md.",
    );
  }
  return { url: supabaseEnv.url, anonKey: supabaseEnv.anonKey };
}

export function requireSupabaseServiceRole(): {
  url: string;
  serviceRoleKey: string;
} {
  if (!supabaseEnv.url || !supabaseEnv.serviceRoleKey) {
    throw new Error(
      "Supabase service role missing. Set SUPABASE_SERVICE_ROLE_KEY in .env.local. See MORNING.md.",
    );
  }
  return { url: supabaseEnv.url, serviceRoleKey: supabaseEnv.serviceRoleKey };
}
