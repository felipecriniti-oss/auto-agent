"use client";

/**
 * KycBanner — displayed on the dashboard when kyc_status !== 'verified'.
 * Prompts the user to complete identity verification before they can
 * assume their first deal.
 */

import { Button } from "@/components/ui/button";
import { useProfile } from "@/lib/supabase/hooks/useProfile";
import { ArrowRight, Clock, ShieldCheck, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";

export function KycBanner() {
  const { data: profile } = useProfile();
  const router = useRouter();

  const kycStatus = profile?.kyc_status ?? "pending";

  if (kycStatus === "verified") return null;

  if (kycStatus === "submitted") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-900/10">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
          <Clock className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Verificação em análise
          </p>
          <p className="mt-0.5 text-[12px] text-slate-600 dark:text-slate-300">
            Seus documentos estão sendo analisados. Você será notificado por WhatsApp quando a
            verificação for concluída.
          </p>
        </div>
      </div>
    );
  }

  if (kycStatus === "rejected") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-900/10">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Verificação recusada
          </p>
          <p className="mt-0.5 text-[12px] text-slate-600 dark:text-slate-300">
            {profile?.kyc_rejection_reason ??
              "Houve um problema com seus documentos. Envie novamente."}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => router.push("/app/kyc")}
          className="shrink-0 bg-[#4C46DC] text-white hover:bg-[#3d38b8]"
        >
          Reenviar
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  // pending or expired
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#4C46DC]/20 bg-[#4C46DC]/[0.03] p-4 dark:border-[#4C46DC]/30 dark:bg-[#4C46DC]/10">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4C46DC]/10 text-[#4C46DC] dark:bg-[#4C46DC]/20">
        <ShieldCheck className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Verifique sua identidade para assumir deals
        </p>
        <p className="mt-0.5 text-[12px] text-slate-600 dark:text-slate-300">
          Complete a verificação KYC para poder firmar contratos na plataforma. Leva menos de 5
          minutos.
        </p>
      </div>
      <Button
        size="sm"
        onClick={() => router.push("/app/kyc")}
        className="shrink-0 bg-[#4C46DC] text-white hover:bg-[#3d38b8]"
      >
        Verificar agora
        <ArrowRight className="ml-1 h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
