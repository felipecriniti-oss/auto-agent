"use client";

// Opt out of static prerender — `useSearchParams()` reads from the request URL
// and Next.js 15 requires the surrounding page to be either dynamic OR wrapped
// in <Suspense> at build time. Auth pages are not cached anyway.
export const dynamic = "force-dynamic";

/**
 * /signup — email + password signup with email confirmation.
 *
 * Supabase signUp creates an auth.users row and sends a confirmation email
 * (if "Confirm email" is enabled in dashboard — on by default).
 *
 * The Postgres trigger `handle_new_auth_user` creates the public.users row
 * automatically. After email verification the /auth/callback route lands
 * new users on /app/onboarding for profile completion (nome, empresa, UF,
 * cidade, CNPJ optional).
 */

import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { estimatePasswordStrength } from "@/lib/auth/password-strength";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { ArrowRight, Mail } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

const MIN_PASSWORD = 8;
const MIN_STRENGTH_SCORE = 2; // zxcvbn "razoável" — blocks weak + very weak

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  );
}

function SignupPageContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const err = searchParams?.get("error");
    if (err) {
      toast.error("Falha no cadastro", { description: decodeURIComponent(err) });
    }
  }, [searchParams]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const callbackUrl = `${origin}/auth/callback`;

  const passwordsMatch = password === confirm;
  const passwordOk = password.length >= MIN_PASSWORD;
  const emailOk = email.includes("@") && email.includes(".");
  const passwordStrongEnough =
    password.length === 0 ||
    estimatePasswordStrength(password, [email]).score >= MIN_STRENGTH_SCORE;
  const canSubmit = emailOk && passwordOk && passwordsMatch && passwordStrongEnough && acceptTerms;

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setAlreadyRegistered(null);
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: callbackUrl,
        },
      });
      if (error) {
        const msg = error.message.toLowerCase();
        // Explicit duplicate — some Supabase configs return this directly.
        if (
          msg.includes("already") ||
          msg.includes("registered") ||
          error.code === "user_already_exists"
        ) {
          setAlreadyRegistered(email.trim());
          return;
        }
        if (error.code === "weak_password" || msg.includes("weak")) {
          toast.error("Senha fraca", {
            description: "Escolha uma senha mais forte (ver indicador abaixo).",
          });
          return;
        }
        // 429 / SMTP rate limit — Supabase default SMTP é 3-4 emails/hora.
        if (
          error.status === 429 ||
          error.code === "over_email_send_rate_limit" ||
          msg.includes("rate limit") ||
          msg.includes("too many")
        ) {
          toast.error("Muitas tentativas em pouco tempo", {
            description:
              "O serviço de email atingiu o limite. Tente novamente em ~1 hora, ou fale com o admin pra configurar SMTP próprio.",
          });
          return;
        }
        toast.error("Não conseguimos criar a conta", { description: error.message });
        return;
      }

      // Supabase privacy behavior: when "Confirm email" is on and the email
      // already exists, signUp returns success BUT user.identities === [].
      // This is the canonical way to detect duplicate without email enumeration.
      if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
        setAlreadyRegistered(email.trim());
        return;
      }

      setSent(true);
      toast.success("Verifique seu email", {
        description: "Enviamos um link para confirmar sua conta.",
      });
    } catch (err) {
      toast.error("Erro inesperado", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignUp = async () => {
    if (!acceptTerms) {
      toast.error("Aceite os termos", {
        description: "Você precisa aceitar os termos para continuar.",
      });
      return;
    }
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
          description: "Use email + senha por enquanto.",
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

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-10">
      <div className="mb-1 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[#4C46DC]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4C46DC]" />
        Cadastro · piloto SP
      </div>
      <h1
        className="text-3xl font-semibold leading-[1.05] tracking-tight text-slate-900 dark:text-slate-50 md:text-4xl"
        style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
      >
        Largue <em className="italic text-[#4C46DC]">com a gente</em>.
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
        Crie sua conta em 1 minuto. Sem pagamento até o primeiro deal confirmado.
      </p>

      {alreadyRegistered ? (
        <div className="mt-8 rounded-xl border border-amber-400/40 bg-amber-50 p-6 text-sm dark:border-amber-500/30 dark:bg-amber-950/30">
          <div className="font-semibold text-amber-900 dark:text-amber-200">
            Já existe uma conta com esse email
          </div>
          <p className="mt-2 text-slate-700 dark:text-slate-200">
            <strong>{alreadyRegistered}</strong> já está cadastrado. Se a conta é sua, entra direto
            no painel; se esqueceu a senha, use "recuperar senha".
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/login?email=${encodeURIComponent(alreadyRegistered)}`}
              className="inline-flex h-9 items-center rounded-md bg-[#4C46DC] px-4 text-[12px] font-semibold text-white hover:bg-[#3d38b8]"
            >
              Entrar
            </Link>
            <Link
              href={`/reset-password?email=${encodeURIComponent(alreadyRegistered)}`}
              className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-4 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              Recuperar senha
            </Link>
            <button
              type="button"
              onClick={() => {
                setAlreadyRegistered(null);
                setEmail("");
                setPassword("");
                setConfirm("");
              }}
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 hover:text-[#4C46DC] hover:underline"
            >
              Usar outro email
            </button>
          </div>
        </div>
      ) : sent ? (
        <div className="mt-8 rounded-xl border border-[#4C46DC]/20 bg-[#4C46DC]/[0.04] p-6 text-sm dark:border-[#4C46DC]/30 dark:bg-[#4C46DC]/10">
          <div className="flex items-center gap-2 font-semibold text-[#4C46DC]">
            <Mail className="h-4 w-4" />
            Verifique seu email
          </div>
          <p className="mt-2 text-slate-700 dark:text-slate-200">
            Enviamos um link de confirmação para <strong>{email}</strong>. Clique nele pra finalizar
            o cadastro e entrar no painel.
          </p>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setEmail("");
              setPassword("");
              setConfirm("");
            }}
            className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4C46DC] hover:underline"
          >
            Usar outro email
          </button>
        </div>
      ) : (
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
              <Label
                htmlFor="password"
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
              >
                Senha (mínimo {MIN_PASSWORD} caracteres)
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                minLength={MIN_PASSWORD}
                required
                disabled={submitting}
                className="mt-1.5 h-11 bg-white dark:bg-slate-950"
              />
              <PasswordStrengthMeter password={password} userInputs={[email]} />
            </div>

            <div>
              <Label
                htmlFor="confirm"
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
              >
                Confirme a senha
              </Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
                disabled={submitting}
                className="mt-1.5 h-11 bg-white dark:bg-slate-950"
              />
              {confirm && !passwordsMatch ? (
                <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">
                  As senhas não conferem.
                </p>
              ) : null}
            </div>

            <label className="flex cursor-pointer items-start gap-2 text-[12px] text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#4C46DC] focus:ring-[#4C46DC]"
                required
              />
              <span>
                Li e aceito os{" "}
                <Link href="/termos" className="font-semibold text-[#4C46DC] hover:underline">
                  Termos
                </Link>{" "}
                e a{" "}
                <Link href="/privacidade" className="font-semibold text-[#4C46DC] hover:underline">
                  Política de Privacidade
                </Link>
                .
              </span>
            </label>

            <Button
              type="submit"
              disabled={submitting || !canSubmit}
              className="group h-11 w-full bg-[#4C46DC] text-sm font-semibold text-white hover:bg-[#3d38b8] disabled:opacity-40"
            >
              {submitting ? "Criando conta..." : "Criar conta"}
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
            onClick={handleGoogleSignUp}
            disabled={googleLoading}
            className="h-11 w-full gap-2.5 text-sm font-medium"
          >
            <GoogleIcon className="h-5 w-5" />
            {googleLoading ? "Abrindo Google..." : "Entrar com Google"}
          </Button>
        </>
      )}

      <p className="mt-6 text-center text-[12px] text-slate-500 dark:text-slate-400">
        Já tem conta?{" "}
        <Link href="/login" className="font-semibold text-[#4C46DC] hover:underline">
          Entre
        </Link>
      </p>
    </div>
  );
}
