"use client";

/**
 * /app/kyc — KYC document verification page (Step 4).
 *
 * Accessed from dashboard banner or when user tries to "Assumir Deal"
 * without kyc_status='verified'. Collects:
 *   - Documento do responsável (RG frente/verso OR CNH frente/verso)
 *   - Selfie com documento (liveness check in production)
 *   - Comprovante de endereço (emissão < 90 dias)
 *   - Contrato Social ou certificado MEI
 *
 * MVP: uploads to Supabase Storage, marks kyc_status='submitted'.
 * Production: integrate idwall/Nuveo for OCR + face match.
 */

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useProfile } from "@/lib/supabase/hooks/useProfile";
import { useSupabaseUser } from "@/lib/supabase/hooks/useSupabaseUser";
import type { KycDocType } from "@/types/database";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Home,
  Loader2,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

/* ─── Document config ─────────────────────────────────────────────────── */

interface DocConfig {
  key: string;
  label: string;
  description: string;
  icon: typeof FileText;
  docTypes: KycDocType[];
  accept: string;
  required: boolean;
}

const DOCUMENT_CONFIGS: DocConfig[] = [
  {
    key: "documento",
    label: "Documento do responsável",
    description: "RG (frente e verso) ou CNH (frente e verso)",
    icon: FileText,
    docTypes: ["rg_frente", "rg_verso", "cnh_frente", "cnh_verso"],
    accept: "image/jpeg,image/png,application/pdf",
    required: true,
  },
  {
    key: "selfie",
    label: "Selfie com documento",
    description: "Tire uma foto segurando seu documento ao lado do rosto",
    icon: Camera,
    docTypes: ["selfie"],
    accept: "image/jpeg,image/png",
    required: true,
  },
  {
    key: "comprovante",
    label: "Comprovante de endereço",
    description: "Conta de luz, água, telefone ou extrato bancário (emissão < 90 dias)",
    icon: Home,
    docTypes: ["comprovante"],
    accept: "image/jpeg,image/png,application/pdf",
    required: true,
  },
  {
    key: "contrato_social",
    label: "Contrato Social ou MEI",
    description: "Para confirmar o vínculo entre o responsável e o CNPJ",
    icon: FileText,
    docTypes: ["contrato_social"],
    accept: "image/jpeg,image/png,application/pdf",
    required: true,
  },
];

/* ─── Types ───────────────────────────────────────────────────────────── */

interface UploadedDoc {
  docType: KycDocType;
  fileName: string;
  preview?: string;
}

/* ─── Page Component ──────────────────────────────────────────────────── */

export default function KycPage() {
  const router = useRouter();
  const { user } = useSupabaseUser();
  const { data: profile } = useProfile();

  const [uploads, setUploads] = useState<Map<string, UploadedDoc[]>>(new Map());
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const kycStatus = profile?.kyc_status ?? "pending";

  /* ─── Upload handler ──────────────────────────────────────────────── */

  const handleFileUpload = useCallback(
    async (configKey: string, docType: KycDocType, files: FileList | null) => {
      if (!files?.length || !user) return;
      const file = files[0];

      if (file.size > 10 * 1024 * 1024) {
        toast.error("Arquivo muito grande. Máximo 10MB.");
        return;
      }

      setUploading(configKey);
      try {
        const supabase = getSupabaseBrowser();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          toast.error("Sessão expirada. Faça login novamente.");
          return;
        }

        const formData = new FormData();
        formData.append("doc_type", docType);
        formData.append("file", file);

        const res = await fetch("/api/kyc", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Falha no upload");
          return;
        }

        // Create preview for images
        let preview: string | undefined;
        if (file.type.startsWith("image/")) {
          preview = URL.createObjectURL(file);
        }

        setUploads((prev) => {
          const next = new Map(prev);
          const existing = next.get(configKey) ?? [];
          next.set(configKey, [
            ...existing.filter((d) => d.docType !== docType),
            { docType, fileName: file.name, preview },
          ]);
          return next;
        });

        toast.success(`${file.name} enviado`);
      } catch {
        toast.error("Erro no upload");
      } finally {
        setUploading(null);
      }
    },
    [user],
  );

  /* ─── Remove handler ──────────────────────────────────────────────── */

  const removeUpload = useCallback((configKey: string, docType: KycDocType) => {
    setUploads((prev) => {
      const next = new Map(prev);
      const existing = next.get(configKey) ?? [];
      next.set(
        configKey,
        existing.filter((d) => d.docType !== docType),
      );
      return next;
    });
  }, []);

  /* ─── Submit all ──────────────────────────────────────────────────── */

  const allRequired = DOCUMENT_CONFIGS.filter((c) => c.required).every(
    (config) => (uploads.get(config.key) ?? []).length > 0,
  );

  const handleSubmitKyc = useCallback(async () => {
    if (!user || !allRequired) return;
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Sessão expirada");
        return;
      }

      const res = await fetch("/api/kyc", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Falha ao enviar para verificação");
        return;
      }

      toast.success("Documentos enviados para verificação!");
      router.push("/app");
    } catch {
      toast.error("Erro ao enviar");
    } finally {
      setSubmitting(false);
    }
  }, [user, allRequired, router]);

  /* ─── Already verified/submitted states ───────────────────────────── */

  if (kycStatus === "verified") {
    return (
      <KycShell>
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h2
            className="text-2xl font-semibold text-slate-900 dark:text-slate-50"
            style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
          >
            Verificação concluída
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Sua identidade foi verificada. Você pode assumir deals normalmente.
          </p>
          <Button
            onClick={() => router.push("/app")}
            className="mt-4 bg-[#4C46DC] text-white hover:bg-[#3d38b8]"
          >
            Voltar ao painel
          </Button>
        </div>
      </KycShell>
    );
  }

  if (kycStatus === "submitted") {
    return (
      <KycShell>
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
            <Clock className="h-8 w-8" />
          </div>
          <h2
            className="text-2xl font-semibold text-slate-900 dark:text-slate-50"
            style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
          >
            Verificação em análise
          </h2>
          <p className="max-w-sm text-sm text-slate-600 dark:text-slate-300">
            Seus documentos foram enviados e estão sendo analisados. Você receberá uma notificação
            no WhatsApp quando a verificação for concluída (geralmente em menos de 24h).
          </p>
          <Button onClick={() => router.push("/app")} variant="outline" className="mt-4">
            Voltar ao painel
          </Button>
        </div>
      </KycShell>
    );
  }

  /* ─── Upload form ─────────────────────────────────────────────────── */

  return (
    <KycShell>
      <div className="mb-1 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[#4C46DC]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4C46DC]" />
        Verificação · KYC
      </div>

      <h1
        className="text-3xl font-semibold leading-[1.05] tracking-tight text-slate-900 dark:text-slate-50 md:text-4xl"
        style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
      >
        Confirme sua <em className="italic text-[#4C46DC]">identidade</em>.
      </h1>

      <p className="mt-3 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
        Para firmar contratos de compra e venda na plataforma, precisamos verificar sua identidade.
        Envie os documentos abaixo — a análise leva em média 2 horas.
      </p>

      <div className="mt-8 space-y-4">
        {DOCUMENT_CONFIGS.map((config) => {
          const configUploads = uploads.get(config.key) ?? [];
          const isUploading = uploading === config.key;
          const hasUpload = configUploads.length > 0;
          const Icon = config.icon;

          // For documento, we need front/back
          const isDocumento = config.key === "documento";
          const primaryDocType: KycDocType = isDocumento ? "cnh_frente" : config.docTypes[0];

          return (
            <div
              key={config.key}
              className={`rounded-xl border p-5 transition-colors ${
                hasUpload
                  ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/50 dark:bg-emerald-900/10"
                  : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    hasUpload
                      ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  {hasUpload ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {config.label}
                    {config.required && <span className="ml-1 text-red-500">*</span>}
                  </div>
                  <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                    {config.description}
                  </p>

                  {/* Uploaded files */}
                  {configUploads.map((doc) => (
                    <div
                      key={doc.docType}
                      className="mt-2 flex items-center gap-2 rounded-lg bg-white/80 px-3 py-2 text-[12px] dark:bg-slate-900/60"
                    >
                      {doc.preview && (
                        <img src={doc.preview} alt="" className="h-8 w-8 rounded object-cover" />
                      )}
                      <span className="flex-1 truncate text-slate-700 dark:text-slate-300">
                        {doc.fileName}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeUpload(config.key, doc.docType)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-800"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* Upload button */}
                  {!hasUpload && (
                    <Label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-[12px] font-medium text-slate-600 transition-colors hover:border-[#4C46DC] hover:text-[#4C46DC] dark:border-slate-700 dark:text-slate-400 dark:hover:border-[#4C46DC] dark:hover:text-[#4C46DC]">
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {isUploading ? "Enviando..." : "Escolher arquivo"}
                      <input
                        type="file"
                        accept={config.accept}
                        className="hidden"
                        disabled={isUploading}
                        onChange={(e) =>
                          handleFileUpload(config.key, primaryDocType, e.target.files)
                        }
                      />
                    </Label>
                  )}

                  {/* For documento: second upload for verso */}
                  {isDocumento &&
                    configUploads.length === 1 &&
                    !configUploads.some((d) => d.docType.includes("verso")) && (
                      <Label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-[12px] font-medium text-slate-600 transition-colors hover:border-[#4C46DC] hover:text-[#4C46DC] dark:border-slate-700 dark:text-slate-400">
                        <Upload className="h-4 w-4" />
                        Verso do documento
                        <input
                          type="file"
                          accept={config.accept}
                          className="hidden"
                          onChange={(e) =>
                            handleFileUpload(config.key, "cnh_verso", e.target.files)
                          }
                        />
                      </Label>
                    )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Submit */}
      <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5 dark:border-slate-800">
        <Button
          variant="ghost"
          onClick={() => router.push("/app")}
          className="h-11 text-sm font-semibold"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar ao painel
        </Button>
        <Button
          onClick={handleSubmitKyc}
          disabled={!allRequired || submitting}
          className="group h-11 bg-[#4C46DC] px-6 text-sm font-semibold text-white hover:bg-[#3d38b8] disabled:opacity-40"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              Enviar para verificação
              <ShieldCheck className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
        Seus documentos são armazenados com criptografia e acessíveis apenas pela equipe de
        verificação. Retenção conforme LGPD.
      </p>
    </KycShell>
  );
}

/* ─── Shell wrapper ───────────────────────────────────────────────────── */

function KycShell({ children }: { children: React.ReactNode }) {
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
      <div className="relative z-10 w-full max-w-[600px]">
        <div className="mb-8 flex items-center gap-2">
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
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-10">
          {children}
        </div>
        <p className="mt-6 text-center text-[11px] text-slate-400">
          © 2026 AutoAgente Tecnologia Ltda · CNPJ em constituição · Piloto SP
        </p>
      </div>
    </div>
  );
}
