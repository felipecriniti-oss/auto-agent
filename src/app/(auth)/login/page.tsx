"use client";

// Opt out of static prerender — `useSearchParams()` reads from the request URL
// and Next.js 15 requires the surrounding page to be either dynamic OR wrapped
// in <Suspense> at build time. Auth pages are not cached anyway.
export const dynamic = "force-dynamic";

/**
 * /login — email + password auth.
 *
 * Primary path: signInWithPassword. Session established on valid credentials.
 * Recovery path: "Esqueceu?" link goes to /reset-password for password reset.
 * Google OAuth: shown with official Google "G" logo; gives a clean error
 *   toast if the provider hasn't been configured in Supabase yet.
 */

import { GoogleIcon } from "@/components/icons/GoogleIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledEmail = searchParams?.get("email") ?? "";

  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const [emailNotConfirmed, setEmailNotConfirmed] = useState<string | null>(null);

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
    setEmailNotConfirmed(null);
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        const msg = error.message.toLowerCase();
        if (error.code === "email_not_confirmed" || msg.includes("not confirmed")) {
          setEmailNotConfirmed(email.trim());
          return;
        }
        if (
          error.code === "invalid_credentials" ||
          msg.includes("invalid login") ||
          msg.includes("invalid credentials")
        ) {
          toast.error("Email ou senha incorretos", {
            description: "Confira os dados ou clique em 'Esqueceu?' pra recuperar.",
          });
          return;
        }
        if (error.status === 429 || msg.includes("rate limit") || msg.includes("too many")) {
          toast.error("Muitas tentativas", {
            description: "Aguarde alguns minutos antes de tentar novamente.",
          });
          return;
        }
        toast.error("Falha ao entrar", { description: error.message });
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

  const handleResendConfirmation = async () => {
    if (!emailNotConfirmed || resendingConfirmation) return;
    setResendingConfirmation(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: emailNotConfirmed,
        options: { emailRedirectTo: callbackUrl },
      });
      if (error) {
        toast.error("Não conseguimos reenviar", { description: error.message });
        return;
      }
      toast.success("Email de confirmação reenviado", {
        description: "Verifique sua caixa de entrada.",
      });
    } catch (err) {
      toast.error("Erro inesperado", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setResendingConfirmation(false);
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

  const canSubmit = email.includes("@") && password.length >= 6;

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
        Entre com seu email e senha.
      </p>

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
          disabled={submitting || !canSubmit}
          className="group h-11 w-full bg-[#4C46DC] text-sm font-semibold text-white hover:bg-[#3d38b8] disabled:opacity-40"
        >
          {submitting ? "Entrando..." : "Entrar"}
          <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </form>

      {emailNotConfirmed ? (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-50 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-950/30">
          <div className="font-semibold text-amber-900 dark:text-amber-200">
            Email ainda não confirmado
          </div>
          <p className="mt-1 text-[13px] text-slate-700 dark:text-slate-200">
            Enviamos um link para <strong>{emailNotConfirmed}</strong> quando você se cadastrou.
            Abre seu email e clica — ou pede um novo link abaixo.
          </p>
          <button
            type="button"
            onClick={handleResendConfirmation}
            disabled={resendingConfirmation}
            className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4C46DC] hover:underline disabled:opacity-50"
          >
            {resendingConfirmation ? "Enviando..." : "Reenviar email de confirmação"}
          </button>
        </div>
      ) : null}

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
        className="h-11 w-full gap-2.5 text-sm font-medium"
      >
        <GoogleIcon className="h-5 w-5" />
        {googleLoading ? "Abrindo Google..." : "Entrar com Google"}
      </Button>

      <p className="mt-6 text-center text-[12px] text-slate-500 dark:text-slate-400">
        Ainda não tem conta?{" "}
        <Link href="/signup" className="font-semibold text-[#4C46DC] hover:underline">
          Cadastre-se
        </Link>
      </p>
    </div>
  );
}
