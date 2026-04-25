"use client";

/**
 * /app/onboarding — profile setup wizard (post-auth).
 *
 * Replaces the fake Phase 5 persona-picker in SignupView. After magic-link
 * verification the callback routes new users here; after they complete the
 * wizard, users.onboarding_complete=true, and subsequent logins land on /app.
 *
 * Two steps (billing/plan picker is deferred to Phase 13a):
 *   1. Nome completo + Empresa + Cidade (+ UF dropdown)
 *   2. CNPJ (optional, mask 00.000.000/0000-00)
 *
 * Uses Fraunces + slate editorial treatment — preserves the Phase 5
 * SignupView aesthetic that the user liked, just moves the gesture to
 * post-auth instead of pre-auth.
 */

import { LocalidadePicker } from "@/components/forms/LocalidadePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WishlistFormSheet } from "@/components/v3/modules/WishlistFormSheet";
import { cidadeExisteNoUf } from "@/lib/brasil/localidades";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useSupabaseUser } from "@/lib/supabase/hooks/useSupabaseUser";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

type Step = 1 | 2 | 3;

function maskCnpj(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 14);
  // 00.000.000/0000-00
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isLoading } = useSupabaseUser();

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState<string>("");
  const [cnpj, setCnpj] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // B5: blocking overlay shown while step 3's onboarding_complete flip is in flight
  const [finalizing, setFinalizing] = useState(false);

  // Belt-and-suspenders: middleware should send unauthed users to /login.
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  const step1Valid =
    name.trim().length >= 2 &&
    companyName.trim().length >= 2 &&
    !!uf &&
    !!city &&
    cidadeExisteNoUf(uf, city);

  const handleStep1 = (e: FormEvent) => {
    e.preventDefault();
    if (!step1Valid) return;
    setStep(2);
  };

  const handleStep2 = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || submitting) return;
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase
        .from("users")
        .update({
          name: name.trim(),
          company_name: companyName.trim(),
          cnpj: cnpj.trim() || null,
          city: city.trim(),
          uf,
          // NOTE: onboarding_complete moved to step 3 handler (save or skip).
          // Per B5/L8: the wizard now has 3 steps; flipping the flag here
          // would cause users to bypass step 3 entirely. The flip happens in
          // either the WishlistFormSheet onSaved callback or the "Pular e
          // fazer depois" handler.
        })
        .eq("id", user.id);

      if (error) {
        toast.error("Falha ao salvar", { description: error.message });
        return;
      }

      // Advance to step 3 (first wishlist) — onboarding_complete flips there.
      setStep(3);
    } catch (err) {
      toast.error("Erro inesperado", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // B5: step 3 save flow — fired by WishlistFormSheet.onSaved AFTER the form
  // sheet has already shown its own success toast for the wishlist insert.
  // Sequential, non-atomic per L8: if this call fails, user stays on step 3
  // with an error toast and can use the "Pular e fazer depois" button as
  // recovery.
  const handleWishlistSaved = async () => {
    if (!user) return;
    setFinalizing(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase
        .from("users")
        .update({ onboarding_complete: true })
        .eq("id", user.id);
      if (error) {
        toast.error(
          "Wishlist salva, mas falhou ao finalizar onboarding. Toque em 'Pular e fazer depois' pra continuar.",
        );
        return;
      }
      toast.success("Onboarding concluído");
      router.push("/app");
    } finally {
      setFinalizing(false);
    }
  };

  // Skip flow — user opts not to create a first wishlist. Same target update
  // as above (onboarding_complete=true), but no wishlist insert.
  const handleSkip = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase
        .from("users")
        .update({ onboarding_complete: true })
        .eq("id", user.id);
      if (error) {
        toast.error("Falha ao pular", { description: error.message });
        return;
      }
      router.push("/app");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-sm text-slate-500">Carregando...</div>
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-10 dark:bg-slate-950"
      style={{
        backgroundImage:
          "radial-gradient(circle at 20% 20%, rgba(76,70,220,0.08), transparent 55%), radial-gradient(circle at 85% 80%, rgba(76,70,220,0.06), transparent 50%)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden="true"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg, rgba(76,70,220,0.06) 0 1px, transparent 1px 28px)",
        }}
      />

      <div className="relative z-10 w-full max-w-[560px]">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/autoagente-whatsapp.svg"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 select-none rounded-xl ring-1 ring-slate-200 dark:ring-slate-800"
              priority
            />
            <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              AutoAgente
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Passo {step} de 3
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-10">
          <div className="mb-1 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[#4C46DC]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4C46DC]" />
            {step === 3 ? "Primeira wishlist · piloto SP" : "Conta · piloto SP"}
          </div>
          <h1
            className="text-3xl font-semibold leading-[1.05] tracking-tight text-slate-900 dark:text-slate-50 md:text-4xl"
            style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
          >
            {step === 1 && (
              <>
                Conta <em className="italic text-[#4C46DC]">quem você é</em>.
              </>
            )}
            {step === 2 && (
              <>
                Quase <em className="italic text-[#4C46DC]">lá</em>.
              </>
            )}
            {step === 3 && "Cadastre seu primeiro carro-alvo"}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
            {step === 1 &&
              "Três infos e você começa a ver oportunidades. Sem pagamento até o primeiro deal confirmado."}
            {step === 2 && "CNPJ é opcional por enquanto — pode cadastrar depois em Configurações."}
            {step === 3 &&
              "Isso configura o sistema pra começar a buscar. Você pode cadastrar mais depois."}
          </p>

          {step === 1 && (
            <form onSubmit={handleStep1} className="mt-8 space-y-5">
              <div>
                <Label
                  htmlFor="name"
                  className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
                >
                  Seu nome completo
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="João da Silva"
                  autoComplete="name"
                  required
                  className="mt-1.5 h-11 bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <Label
                  htmlFor="company"
                  className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
                >
                  Nome da operação / loja
                </Label>
                <Input
                  id="company"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Auto Premium SP"
                  autoComplete="organization"
                  required
                  className="mt-1.5 h-11 bg-white dark:bg-slate-950"
                />
              </div>

              <LocalidadePicker
                uf={uf}
                cidade={city}
                onUfChange={setUf}
                onCidadeChange={setCity}
                required
              />

              <div className="flex items-center justify-end border-t border-slate-100 pt-5 dark:border-slate-800">
                <Button
                  type="submit"
                  disabled={!step1Valid}
                  className="group h-11 bg-[#4C46DC] px-6 text-sm font-semibold text-white hover:bg-[#3d38b8] disabled:opacity-40"
                >
                  Continuar
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </div>
            </form>
          )}
          {step === 2 && (
            <form onSubmit={handleStep2} className="mt-8 space-y-5">
              <div>
                <Label
                  htmlFor="cnpj"
                  className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
                >
                  CNPJ <span className="text-slate-400 normal-case">(opcional)</span>
                </Label>
                <Input
                  id="cnpj"
                  type="text"
                  inputMode="numeric"
                  value={cnpj}
                  onChange={(e) => setCnpj(maskCnpj(e.target.value))}
                  placeholder="00.000.000/0000-00"
                  className="mt-1.5 h-11 bg-white dark:bg-slate-950"
                  maxLength={18}
                />
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  Necessário antes do primeiro deal — fica guardado em Configurações.
                </p>
              </div>

              <div className="rounded-xl border border-[#4C46DC]/15 bg-[#4C46DC]/[0.03] p-4 text-[12px] text-slate-600 dark:border-[#4C46DC]/30 dark:bg-[#4C46DC]/10 dark:text-slate-300">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4C46DC]" />
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {name || "—"} · {companyName || "—"}
                    </div>
                    <div className="mt-0.5">
                      {city || "—"} / {uf}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-5 dark:border-slate-800">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(1)}
                  className="h-11 text-sm font-semibold"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Voltar
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="group h-11 bg-[#4C46DC] px-6 text-sm font-semibold text-white hover:bg-[#3d38b8] disabled:opacity-40"
                >
                  {submitting ? "Salvando..." : "Continuar"}
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </div>
            </form>
          )}
          {step === 3 && (
            <div className="mt-8 space-y-6">
              {/*
                B5 + L8: step 3 save flow is sequential and non-atomic.
                1) WishlistFormSheet runs useCreateWishlist.mutateAsync; on
                   success it fires its own toast.success("Wishlist ... criada")
                   and then invokes onSaved(created).
                2) handleWishlistSaved performs the SECOND step (the
                   onboarding_complete flip), with its own loading overlay
                   and a single additional success toast.
                3) On failure of step 2, user stays on step 3 with a recovery
                   message and "Pular e fazer depois" can retry the flip.
              */}
              <WishlistFormSheet
                layout="inline"
                submitLabel="Salvar e começar"
                onSaved={handleWishlistSaved}
              />
              {finalizing && (
                <div
                  aria-live="polite"
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
                >
                  <div className="rounded-md bg-white px-6 py-4 shadow-lg dark:bg-slate-900">
                    <p className="text-sm text-slate-700 dark:text-slate-200">
                      Finalizando onboarding...
                    </p>
                  </div>
                </div>
              )}
              <Button
                variant="ghost"
                type="button"
                disabled={finalizing}
                onClick={handleSkip}
                className="w-full"
              >
                Pular e fazer depois
              </Button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-400">
          © 2026 AutoAgente Tecnologia Ltda · CNPJ em constituição · Piloto SP
        </p>
      </div>
    </div>
  );
}
