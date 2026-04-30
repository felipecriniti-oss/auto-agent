"use client";

/**
 * /app/onboarding — profile setup wizard (post-auth).
 *
 * v3.2 Onboarding: 4-step wizard with progressive KYC.
 *
 * Steps 1-3 (required to access marketplace):
 *   1. Nome + Empresa + Cidade/UF + Telefone WhatsApp (OTP) + Tipo Operação + Volume
 *   2. CNPJ (obrigatório, auto-fill via ReceitaWS) + Lead Source
 *   3. Primeira Wishlist (unchanged from v1)
 *
 * Step 4 (KYC — required before first "Assumir Deal"):
 *   4. Upload RG/CNH + Selfie + Comprovante + Contrato Social
 *
 * After Step 3: onboarding_complete=true, user enters /app.
 * Step 4 is accessed later from dashboard or when attempting to assume a deal.
 */

import { LocalidadePicker } from "@/components/forms/LocalidadePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WishlistFormSheet } from "@/components/v3/modules/WishlistFormSheet";
import { cidadeExisteNoUf } from "@/lib/brasil/localidades";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useSupabaseUser } from "@/lib/supabase/hooks/useSupabaseUser";
import type { CnpjLookupResult } from "@/app/api/cnpj/route";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  Phone,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type Step = 1 | 2 | 3;

/* ─── Masks ───────────────────────────────────────────────────────────────── */

function maskCnpj(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/* ─── Types ───────────────────────────────────────────────────────────────── */

type TipoOperacao = "loja_fisica" | "patio" | "home_office" | "consignacao" | "investidor";
type VolumeMensal = "1-5" | "6-15" | "16-30" | "30+";

const TIPO_OPERACAO_LABELS: Record<TipoOperacao, string> = {
  loja_fisica: "Loja física",
  patio: "Pátio",
  home_office: "Home office",
  consignacao: "Consignação",
  investidor: "Investidor",
};

const VOLUME_LABELS: Record<VolumeMensal, string> = {
  "1-5": "1 a 5 veículos/mês",
  "6-15": "6 a 15 veículos/mês",
  "16-30": "16 a 30 veículos/mês",
  "30+": "30+ veículos/mês",
};

const LEAD_SOURCE_OPTIONS = [
  { value: "indicacao", label: "Indicação" },
  { value: "google", label: "Google" },
  { value: "instagram", label: "Instagram" },
  { value: "evento", label: "Evento / feira" },
  { value: "outro", label: "Outro" },
];

/* ─── Select styling ──────────────────────────────────────────────────────── */

const selectClass =
  "mt-1.5 h-11 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

const labelClass =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400";

/* ─── Page Component ──────────────────────────────────────────────────────── */

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isLoading } = useSupabaseUser();

  // Step state
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // Step 1 fields
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [tipoOperacao, setTipoOperacao] = useState<TipoOperacao | "">("");
  const [volumeMensal, setVolumeMensal] = useState<VolumeMensal | "">("");

  // Step 2 fields
  const [cnpj, setCnpj] = useState("");
  const [cnpjData, setCnpjData] = useState<CnpjLookupResult | null>(null);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjError, setCnpjError] = useState<string | null>(null);
  const [leadSource, setLeadSource] = useState("");

  // Belt-and-suspenders: middleware should send unauthed users to /login
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  /* ─── OTP handlers ────────────────────────────────────────────────────── */

  const sendOtp = useCallback(async () => {
    if (phone.replace(/\D/g, "").length < 10) {
      toast.error("Número de telefone inválido");
      return;
    }
    setOtpLoading(true);
    try {
      const res = await fetch("/api/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.replace(/\D/g, ""), action: "send" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Falha ao enviar código");
        return;
      }
      setOtpSent(true);
      toast.success("Código enviado para seu WhatsApp");
      // Dev mode: auto-fill code
      if (data.debug_code) {
        setOtpCode(data.debug_code);
      }
    } catch {
      toast.error("Erro ao enviar código");
    } finally {
      setOtpLoading(false);
    }
  }, [phone]);

  const verifyOtp = useCallback(async () => {
    if (otpCode.length !== 6) return;
    setOtpLoading(true);
    try {
      const res = await fetch("/api/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.replace(/\D/g, ""),
          action: "verify",
          code: otpCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Código incorreto");
        return;
      }
      setPhoneVerified(true);
      toast.success("Telefone verificado!");
    } catch {
      toast.error("Erro na verificação");
    } finally {
      setOtpLoading(false);
    }
  }, [phone, otpCode]);

  /* ─── CNPJ lookup ─────────────────────────────────────────────────────── */

  const lookupCnpj = useCallback(async (cnpjValue: string) => {
    const digits = cnpjValue.replace(/\D/g, "");
    if (digits.length !== 14) return;

    setCnpjLoading(true);
    setCnpjError(null);
    setCnpjData(null);
    try {
      const res = await fetch(`/api/cnpj?cnpj=${digits}`);
      const data = await res.json();
      if (!res.ok) {
        setCnpjError(data.error ?? "CNPJ não encontrado");
        return;
      }
      setCnpjData(data as CnpjLookupResult);
      if (data.situacao !== "ATIVA") {
        setCnpjError(`Situação cadastral: ${data.situacao}. CNPJ precisa estar ATIVO.`);
      }
    } catch {
      setCnpjError("Falha na consulta. Tente novamente.");
    } finally {
      setCnpjLoading(false);
    }
  }, []);

  /* ─── Validations ─────────────────────────────────────────────────────── */

  const step1Valid =
    name.trim().length >= 2 &&
    companyName.trim().length >= 2 &&
    !!uf &&
    !!city &&
    cidadeExisteNoUf(uf, city) &&
    phoneVerified &&
    !!tipoOperacao &&
    !!volumeMensal;

  const cnpjDigits = cnpj.replace(/\D/g, "");
  const step2Valid =
    cnpjDigits.length === 14 &&
    !!cnpjData &&
    cnpjData.situacao === "ATIVA";

  /* ─── Step handlers ───────────────────────────────────────────────────── */

  const handleStep1 = (e: FormEvent) => {
    e.preventDefault();
    if (!step1Valid) return;
    setStep(2);
  };

  const handleStep2 = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || submitting || !step2Valid || !cnpjData) return;
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase
        .from("users")
        .update({
          name: name.trim(),
          company_name: companyName.trim(),
          city: city.trim(),
          uf,
          phone: phone.replace(/\D/g, ""),
          phone_verified: true,
          cnpj: cnpj.trim(),
          cnpj_razao_social: cnpjData.razao_social,
          cnpj_situacao: cnpjData.situacao,
          cnpj_cnae: cnpjData.cnae_codigo,
          tipo_operacao: tipoOperacao as TipoOperacao,
          volume_mensal: volumeMensal as VolumeMensal,
          lead_source: leadSource || null,
        })
        .eq("id", user.id);

      if (error) {
        toast.error("Falha ao salvar", { description: error.message });
        return;
      }
      setStep(3);
    } catch (err) {
      toast.error("Erro inesperado", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  };

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
          "Wishlist salva, mas falhou ao finalizar onboarding. Toque em 'Pular' pra continuar.",
        );
        return;
      }
      toast.success("Onboarding concluído! Bem-vindo ao AutoAgente.");
      router.push("/app");
    } finally {
      setFinalizing(false);
    }
  };

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

  /* ─── Loading state ───────────────────────────────────────────────────── */

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-sm text-slate-500">Carregando...</div>
      </div>
    );
  }

  /* ─── Render ──────────────────────────────────────────────────────────── */

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
        {/* Header */}
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

        {/* Progress bar */}
        <div className="mb-6 flex gap-1.5">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-[#4C46DC]" : "bg-slate-200 dark:bg-slate-800"
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-10">
          <div className="mb-1 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[#4C46DC]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4C46DC]" />
            {step === 1 && "Perfil · sobre você"}
            {step === 2 && "Empresa · CNPJ"}
            {step === 3 && "Primeira wishlist · piloto SP"}
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
                Dados da <em className="italic text-[#4C46DC]">empresa</em>.
              </>
            )}
            {step === 3 && "Cadastre seu primeiro carro-alvo"}
          </h1>

          <p className="mt-3 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
            {step === 1 &&
              "Seis infos e você começa a ver oportunidades. Sem pagamento até o primeiro deal confirmado."}
            {step === 2 &&
              "CNPJ ativo é obrigatório para firmar contratos de compra e venda na plataforma."}
            {step === 3 &&
              "Isso configura o sistema pra começar a buscar. Você pode cadastrar mais depois."}
          </p>

          {/* ─── STEP 1: Profile ──────────────────────────────────────── */}
          {step === 1 && (
            <form onSubmit={handleStep1} className="mt-8 space-y-5">
              <div>
                <Label htmlFor="name" className={labelClass}>
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
                <Label htmlFor="company" className={labelClass}>
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

              {/* Phone + OTP */}
              <div>
                <Label htmlFor="phone" className={labelClass}>
                  <Phone className="mr-1 inline h-3 w-3" />
                  WhatsApp (para receber alertas de deals)
                </Label>
                <div className="mt-1.5 flex gap-2">
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => {
                      setPhone(maskPhone(e.target.value));
                      setPhoneVerified(false);
                      setOtpSent(false);
                      setOtpCode("");
                    }}
                    placeholder="(11) 99999-9999"
                    disabled={phoneVerified}
                    className="h-11 flex-1 bg-white dark:bg-slate-950"
                  />
                  {!phoneVerified && !otpSent && (
                    <Button
                      type="button"
                      onClick={sendOtp}
                      disabled={phone.replace(/\D/g, "").length < 10 || otpLoading}
                      className="h-11 bg-[#4C46DC] px-4 text-sm font-semibold text-white hover:bg-[#3d38b8] disabled:opacity-40"
                    >
                      {otpLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Enviar código"
                      )}
                    </Button>
                  )}
                  {phoneVerified && (
                    <div className="flex h-11 items-center gap-1 rounded-lg bg-emerald-50 px-3 text-sm font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      Verificado
                    </div>
                  )}
                </div>

                {/* OTP input */}
                {otpSent && !phoneVerified && (
                  <div className="mt-3 flex gap-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      className="h-11 w-32 bg-white text-center font-mono text-lg tracking-[0.3em] dark:bg-slate-950"
                    />
                    <Button
                      type="button"
                      onClick={verifyOtp}
                      disabled={otpCode.length !== 6 || otpLoading}
                      className="h-11 bg-[#4C46DC] px-4 text-sm font-semibold text-white hover:bg-[#3d38b8] disabled:opacity-40"
                    >
                      {otpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={sendOtp}
                      disabled={otpLoading}
                      className="h-11 text-sm"
                    >
                      Reenviar
                    </Button>
                  </div>
                )}
              </div>

              {/* Tipo operação */}
              <div>
                <Label htmlFor="tipo-operacao" className={labelClass}>
                  <Building2 className="mr-1 inline h-3 w-3" />
                  Tipo de operação
                </Label>
                <select
                  id="tipo-operacao"
                  value={tipoOperacao}
                  onChange={(e) => setTipoOperacao(e.target.value as TipoOperacao)}
                  required
                  className={selectClass}
                >
                  <option value="" disabled>
                    Selecione...
                  </option>
                  {(Object.keys(TIPO_OPERACAO_LABELS) as TipoOperacao[]).map((key) => (
                    <option key={key} value={key}>
                      {TIPO_OPERACAO_LABELS[key]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Volume mensal */}
              <div>
                <Label htmlFor="volume" className={labelClass}>
                  Volume médio mensal
                </Label>
                <select
                  id="volume"
                  value={volumeMensal}
                  onChange={(e) => setVolumeMensal(e.target.value as VolumeMensal)}
                  required
                  className={selectClass}
                >
                  <option value="" disabled>
                    Selecione...
                  </option>
                  {(Object.keys(VOLUME_LABELS) as VolumeMensal[]).map((key) => (
                    <option key={key} value={key}>
                      {VOLUME_LABELS[key]}
                    </option>
                  ))}
                </select>
              </div>

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

          {/* ─── STEP 2: CNPJ ─────────────────────────────────────────── */}
          {step === 2 && (
            <form onSubmit={handleStep2} className="mt-8 space-y-5">
              <div>
                <Label htmlFor="cnpj" className={labelClass}>
                  CNPJ da empresa
                </Label>
                <div className="mt-1.5 flex gap-2">
                  <Input
                    id="cnpj"
                    type="text"
                    inputMode="numeric"
                    value={cnpj}
                    onChange={(e) => {
                      const masked = maskCnpj(e.target.value);
                      setCnpj(masked);
                      setCnpjData(null);
                      setCnpjError(null);
                      // Auto-lookup when fully typed
                      if (masked.replace(/\D/g, "").length === 14) {
                        lookupCnpj(masked);
                      }
                    }}
                    placeholder="00.000.000/0000-00"
                    className="h-11 flex-1 bg-white dark:bg-slate-950"
                    maxLength={18}
                  />
                  {cnpjLoading && (
                    <div className="flex h-11 items-center px-3">
                      <Loader2 className="h-5 w-5 animate-spin text-[#4C46DC]" />
                    </div>
                  )}
                </div>
                {cnpjError && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-[12px] text-red-700 dark:bg-red-900/20 dark:text-red-400">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{cnpjError}</span>
                  </div>
                )}
              </div>

              {/* Auto-fill card */}
              {cnpjData && (
                <div className="rounded-xl border border-[#4C46DC]/15 bg-[#4C46DC]/[0.03] p-4 text-[12px] dark:border-[#4C46DC]/30 dark:bg-[#4C46DC]/10">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4C46DC]" />
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {cnpjData.razao_social}
                      </div>
                      {cnpjData.nome_fantasia && (
                        <div className="text-slate-600 dark:text-slate-300">
                          {cnpjData.nome_fantasia}
                        </div>
                      )}
                      <div className="text-slate-500 dark:text-slate-400">
                        Situação: <span className={cnpjData.situacao === "ATIVA" ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>{cnpjData.situacao}</span>
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        CNAE: {cnpjData.cnae_codigo} — {cnpjData.cnae_descricao}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {cnpjData.endereco}, {cnpjData.municipio}/{cnpjData.uf}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary card */}
              <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-4 text-[12px] text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {name} · {companyName}
                    </div>
                    <div className="mt-0.5">
                      {city}/{uf} · {TIPO_OPERACAO_LABELS[tipoOperacao as TipoOperacao]} · {VOLUME_LABELS[volumeMensal as VolumeMensal]}
                    </div>
                    <div className="mt-0.5">WhatsApp: {phone} ✓</div>
                  </div>
                </div>
              </div>

              {/* Lead source (optional) */}
              <div>
                <Label htmlFor="lead-source" className={labelClass}>
                  Como conheceu o AutoAgente? <span className="normal-case text-slate-400">(opcional)</span>
                </Label>
                <select
                  id="lead-source"
                  value={leadSource}
                  onChange={(e) => setLeadSource(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Selecione...</option>
                  {LEAD_SOURCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
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
                  disabled={!step2Valid || submitting}
                  className="group h-11 bg-[#4C46DC] px-6 text-sm font-semibold text-white hover:bg-[#3d38b8] disabled:opacity-40"
                >
                  {submitting ? "Salvando..." : "Continuar"}
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </div>
            </form>
          )}

          {/* ─── STEP 3: Wishlist ─────────────────────────────────────── */}
          {step === 3 && (
            <div className="mt-8 space-y-6">
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
