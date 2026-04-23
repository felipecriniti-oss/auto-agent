/**
 * /auth/callback — exchanges the magic-link / OAuth ?code for a session.
 *
 * Called by Supabase after the user clicks the magic-link or finishes the
 * OAuth dance. Responsibilities:
 *   1. Read ?code=... from the URL.
 *   2. supabase.auth.exchangeCodeForSession(code) → sets the session cookies.
 *   3. Query public.users.onboarding_complete for the now-authed user.
 *   4. Redirect:
 *        - no profile row / onboarding_complete=false → /app/onboarding
 *        - onboarding_complete=true                   → /app (or ?redirect= target)
 *   5. On failure → /login?error=...
 *
 * Uses the SSR cookie-bound server client so the new session is persisted
 * to the browser for subsequent /app/* requests gated by middleware.
 */

import { getSupabaseServer } from "@/lib/supabase/server";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const url = request.nextUrl.clone();
  const code = url.searchParams.get("code");
  const redirectTarget = url.searchParams.get("redirect");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // OAuth / magic-link upstream failure — Supabase bounces back with ?error=
  if (error) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("error", errorDescription ?? error);
    return NextResponse.redirect(login);
  }

  if (!code) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("error", "missing_code");
    return NextResponse.redirect(login);
  }

  try {
    const supabase = await getSupabaseServer();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      const login = request.nextUrl.clone();
      login.pathname = "/login";
      login.search = "";
      login.searchParams.set("error", exchangeError.message);
      return NextResponse.redirect(login);
    }

    // Fetch the user to decide where to land them.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const login = request.nextUrl.clone();
      login.pathname = "/login";
      login.search = "";
      login.searchParams.set("error", "session_not_found");
      return NextResponse.redirect(login);
    }

    // Onboarding-complete check. RLS allows users to read their own row.
    // The trigger handle_new_auth_user creates the row automatically on first
    // auth, so a missing row is treated as "needs onboarding".
    const { data: profile } = await supabase
      .from("users")
      .select("onboarding_complete")
      .eq("id", user.id)
      .maybeSingle();

    const next = request.nextUrl.clone();
    next.search = "";
    if (profile?.onboarding_complete) {
      next.pathname = redirectTarget?.startsWith("/app") ? redirectTarget : "/app";
    } else {
      next.pathname = "/app/onboarding";
    }
    return NextResponse.redirect(next);
  } catch (err) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("error", err instanceof Error ? err.message : "callback_failed");
    return NextResponse.redirect(login);
  }
}
