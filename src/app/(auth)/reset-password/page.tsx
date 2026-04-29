"use client";

// Opt out of static prerender — `useSearchParams()` reads from the request URL
// and Next.js 15 requires the surrounding page to be either dynamic OR wrapped
// in <Suspense> at build time. Auth pages are not cached anyway.
export const dynamic = "force-dynamic";

/**
 * /reset-password — two-state password reset flow.
 *
 * State A (request): email input. Calls supabase.auth.resetPasswordForEmail
 *   which sends a recovery link. Link lands back on this page with a
 *   short-lived recovery session.
 *
 * State B (set new): once the user has a recovery session (detected via
 *   supabase.auth.onAuthStateChange 'PASSWORD_RECOVERY' event), show the
 *   new password form. Updating succeeds only with the recovery session.
 */

import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { estimatePasswordStrength } from "@/lib/auth/password-strength";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { ArrowRight, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

const MIN_PASSWORD = 8;
const MIN_STRENGTH_SCORE = 2;

type Phase = "request" | "sent" | "set-new";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}

function ResetPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledEmail = searchParams?.get("email") ?? "";

  const [phase, setPhase] = useState<Phase>("request");
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Detect incoming recovery session from the magic link click.
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPhase("set-new");
      }
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const redirectTo = `${origin}/reset-password`;

  const handleRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes("@") || submitting) return;
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) {
        const msg = error.message.toLowerCase();
        if (error.status === 429 || msg.includes("rate limit") || msg.includes("too many")) {
          toast.error("Muitas tentativas em pouco tempo", {
            description: "O serviço de email atingiu o limite. Tente novamente em ~1 hora.",
          });
          return;
        }
        toast.error("Não conseguimos enviar o email", { description: error.message });
        return;
      }
      setPhase("sent");
      toast.success("Verifique seu email", {
        description: "Enviamos um link para você redefinir a senha.",
      });
    } catch (err) {
      toast.error("Erro inesperado", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const passwordsMatch = password === confirm;
  const passwordOk = password.length >= MIN_PASSWORD;
  const passwordStrongEnough =
    password.length === 0 ||
    estimatePasswordStrength(password, [email]).score >= MIN_STRENGTH_SCORE;
  const canSetNew = passwordOk && passwordsMatch && passwordStrongEnough;

  const handleSetNew = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSetNew || submitting) return;
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error("Falha ao atualizar senha", { description: error.message });
        return;
      }
      toast.success("Senha atualizada", { description: "Entrando no painel..." });
      router.replace("/app");
    } catch (err) {
      toast.error("Erro inesperado", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-10">
      <div className="mb-1 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[#4C46DC]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4C46DC]" />
        Redefinir senha
      </div>
      <h1
        className="text-3xl font-semibold leading-[1.05] tracking-tight text-slate-900 dark:text-slate-50 md:text-4xl"
        style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
      >
        {phase === "set-new" ? (
          <>
            Nova <em className="italic text-[#4C46DC]">senha</em>.
          </>
        ) : (
          <>
            Recupere <em className="italic text-[#4C46DC]">o acesso</em>.
          </>
        )}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
        {phase === "request"
          ? "Digite seu email e enviaremos um link para criar uma nova senha."
          : phase === "sent"
            ? "Enviado! Confira sua caixa de entrada."
            : "Escolha uma nova senha (mínimo 8 caracteres)."}
      </p>

      {phase === "request" ? (
        <form onSubmit={handleRequest} className="mt-8 space-y-4">
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
            {submitting ? "Enviando..." : "Enviar link de recuperação"}
            <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </form>
      ) : phase === "sent" ? (
        <div className="mt-8 rounded-xl border border-[#4C46DC]/20 bg-[#4C46DC]/[0.04] p-6 text-sm dark:border-[#4C46DC]/30 dark:bg-[#4C46DC]/10">
          <div className="flex items-center gap-2 font-semibold text-[#4C46DC]">
            <Mail className="h-4 w-4" />
            Verifique seu email
          </div>
          <p className="mt-2 text-slate-700 dark:text-slate-200">
            Enviamos um link para <strong>{email}</strong>. Ao clicar, você volta aqui para definir
            sua nova senha.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSetNew} className="mt-8 space-y-4">
          <div>
            <Label
              htmlFor="new-password"
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
            >
              Nova senha
            </Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              htmlFor="new-confirm"
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
            >
              Confirme a nova senha
            </Label>
            <Input
              id="new-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
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
          <Button
            type="submit"
            disabled={submitting || !canSetNew}
            className="group h-11 w-full bg-[#4C46DC] text-sm font-semibold text-white hover:bg-[#3d38b8] disabled:opacity-40"
          >
            {submitting ? "Salvando..." : "Atualizar senha"}
            <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-[12px] text-slate-500 dark:text-slate-400">
        Lembrou?{" "}
        <Link href="/login" className="font-semibold text-[#4C46DC] hover:underline">
          Voltar ao login
        </Link>
      </p>
    </div>
  );
}
