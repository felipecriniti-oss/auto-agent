"use client";

/**
 * /login — password-primary auth with magic-link fallback.
 *
 * Primary path: email + password via signInWithPassword — fast, familiar to
 *   dealer audience. Session established immediately on valid credentials.
 *
 * Fallback path: "Entrar sem senha" toggles to magic-link mode for users who
 *   forgot/don't have a password yet. Supabase sends one-time code to email;
 *   click lands on /auth/callback?code=... → session → /app.
 *
 * Google OAuth (future): button kept in markup, disabled if provider not yet
 *   configured in Supabase dashboard.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { ArrowRight, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

type Mode = "password" | "magicLink";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

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

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes("@") || password.length < 6 || submitting) return;
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        toast.error("Email ou senha incorretos", { description: error.message });
        return;
      }
      router.replace(redirect || "/app");
    } catch (err) {
      toast.error("Erro inesperado", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMagicLinkSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes("@") || submitting) return;
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: callbackUrl, shouldCreateUser: false },
      });
      if (error) {
        toast.error("Não conseguimos enviar o link", { description: error.message });
        return;
      }
      setMagicSent(true);
      toast.success("Verifique seu email", {
        description: "Enviamos um link para você entrar sem senha.",
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
        toast.error("Google não configurado ainda", {
          description: "Use email + senha ou link mágico.",
        });
        setGoogleLoading(false);
      }
    } catch (err) {
      toast.error("Erro inesperado", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
      setGoogleLoading(false);
    }
  };

  const canSubmitPassword = email.includes("@") && password.length >= 6;
  const canSubmitMagic = email.includes("@");

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
        {mode === "password"
          ? "Entre com seu email e senha."
          : "Enviamos um link por email — sem precisar de senha."}
      </p>

      {magicSent ? (
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
              setMagicSent(false);
              setEmail("");
              setMode("password");
            }}
            className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4C46DC] hover:underline"
          >
            Voltar
          </button>
        </div>
      ) : mode === "password" ? (
        <>
          <form onSubmit={handlePasswordSubmit} className="mt-8 space-y-4">
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

            <div>
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="password"
                  className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
                >
                  Senha
                </Label>
                <Link
                  href="/reset-password"
                  className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4C46DC] hover:underline"
                >
                  Esqueceu?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                minLength={6}
                required
                disabled={submitting}
                className="mt-1.5 h-11 bg-white dark:bg-slate-950"
              />
            </div>

            <Button
              type="submit"
              disabled={submitting || !canSubmitPassword}
              className="group h-11 w-full bg-[#4C46DC] text-sm font-semibold text-white hover:bg-[#3d38b8] disabled:opacity-40"
            >
              {submitting ? "Entrando..." : "Entrar"}
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

          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMode("magicLink")}
              disabled={submitting}
              className="h-11 w-full text-sm font-semibold"
            >
              Entrar sem senha (link por email)
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="h-11 w-full text-sm font-semibold"
            >
              {googleLoading ? "Abrindo Google..." : "Continuar com Google"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <form onSubmit={handleMagicLinkSubmit} className="mt-8 space-y-4">
            <div>
              <Label
                htmlFor="email-magic"
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
              >
                Email
              </Label>
              <Input
                id="email-magic"
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
              disabled={submitting || !canSubmitMagic}
              className="group h-11 w-full bg-[#4C46DC] text-sm font-semibold text-white hover:bg-[#3d38b8] disabled:opacity-40"
            >
              {submitting ? "Enviando..." : "Enviar link mágico"}
              <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setMode("password")}
            className="mt-6 w-full text-center font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 hover:text-[#4C46DC] hover:underline"
          >
            ← Voltar para login com senha
          </button>
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
