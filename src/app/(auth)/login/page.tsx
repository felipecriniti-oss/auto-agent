"use client";

/**
 * /login — email magic-link + Google OAuth.
 *
 * Success path (magic link): Supabase sends the one-time code to the email.
 *   User clicks it → Supabase redirects to /auth/callback?code=... → callback
 *   exchanges for session → redirect to /app (or /app/onboarding).
 *
 * Success path (Google OAuth): Supabase redirects to Google → back to
 *   /auth/callback → same exchange → redirect.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { ArrowRight, Mail } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const searchParams = useSearchParams();

  // Surface callback errors (?error=...) via toast once on mount.
  useEffect(() => {
    const err = searchParams?.get("error");
    if (err) {
      toast.error("Falha ao entrar", {
        description: decodeURIComponent(err),
      });
    }
  }, [searchParams]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const redirect = searchParams?.get("redirect") ?? "";
  const callbackUrl = `${origin}/auth/callback${
    redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""
  }`;

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes("@") || submitting) return;
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: callbackUrl },
      });
      if (error) {
        toast.error("Não conseguimos enviar o link", { description: error.message });
        return;
      }
      setSent(true);
      toast.success("Verifique seu email", {
        description: "Enviamos um link mágico para você entrar.",
      });
    } catch (err) {
      toast.error("Erro inesperado", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl },
      });
      if (error) {
        toast.error("Falha no Google", { description: error.message });
        setGoogleLoading(false);
      }
      // Otherwise: browser navigates to Google; no need to clear state.
    } catch (err) {
      toast.error("Erro inesperado", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
      setGoogleLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-10">
      <div className="mb-1 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[#4C46DC]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4C46DC]" />
        Entrar · painel do lojista
      </div>
      <h1
        className="text-3xl font-semibold leading-[1.05] tracking-tight text-slate-900 dark:text-slate-50 md:text-4xl"
        style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
      >
        Bem-vindo <em className="italic text-[#4C46DC]">de volta</em>.
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
        Entre com seu email — enviamos um link mágico pra você acessar sem senha.
      </p>

      {sent ? (
        <div className="mt-8 rounded-xl border border-[#4C46DC]/20 bg-[#4C46DC]/[0.04] p-6 text-sm dark:border-[#4C46DC]/30 dark:bg-[#4C46DC]/10">
          <div className="flex items-center gap-2 font-semibold text-[#4C46DC]">
            <Mail className="h-4 w-4" />
            Verifique seu email
          </div>
          <p className="mt-2 text-slate-700 dark:text-slate-200">
            Enviamos um link mágico para <strong>{email}</strong>. Clique nele pra entrar no painel.
          </p>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
            className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4C46DC] hover:underline"
          >
            Usar outro email
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={handleEmailSubmit} className="mt-8 space-y-4">
            <div>
              <Label
                htmlFor="email"
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
              >
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@sua-loja.com.br"
                autoComplete="email"
                required
                disabled={submitting}
                className="mt-1.5 h-11 bg-white dark:bg-slate-950"
              />
            </div>

            <Button
              type="submit"
              disabled={submitting || !email.includes("@")}
              className="group h-11 w-full bg-[#4C46DC] text-sm font-semibold text-white hover:bg-[#3d38b8] disabled:opacity-40"
            >
              {submitting ? "Enviando..." : "Entrar com email"}
              <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              ou
            </span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="h-11 w-full text-sm font-semibold"
          >
            {googleLoading ? "Abrindo Google..." : "Entrar com Google"}
          </Button>
        </>
      )}

      <p className="mt-6 text-center text-[12px] text-slate-500 dark:text-slate-400">
        Ainda não tem conta?{" "}
        <Link href="/signup" className="font-semibold text-[#4C46DC] hover:underline">
          Cadastre-se
        </Link>
      </p>
    </div>
  );
}
