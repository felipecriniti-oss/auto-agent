/**
 * Next.js middleware — refreshes Supabase session cookie on every request,
 * and gates `/app/*` behind authentication.
 *
 * Public routes: /, /login, /signup, /reset-password, /auth/callback,
 *                /privacidade, /termos, /pricing
 * Protected:     /app/*
 *
 * During pre-Phase-6 bootstrapping (Supabase not yet configured), this
 * middleware is a no-op so the app keeps working on localStorage.
 */

import { isSupabaseConfigured, supabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/reset-password",
  "/auth/callback",
  "/privacidade",
  "/termos",
  "/pricing",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isProtectedPath(pathname: string): boolean {
  return pathname.startsWith("/app");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // If Supabase isn't configured yet (pre-Phase-6), skip auth entirely.
  if (!isSupabaseConfigured()) {
    return NextResponse.next();
  }

  // Build a response we can attach cookies to.
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseEnv.url, supabaseEnv.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh the session cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Route protection for /app/*
  if (isProtectedPath(pathname) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated users landing on /login get sent to /app
  if (pathname === "/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  // No-op unless path matches matcher below
  if (!isPublicPath(pathname) && !isProtectedPath(pathname)) {
    return response;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image, favicon, images, fonts, api/*, public svgs
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
