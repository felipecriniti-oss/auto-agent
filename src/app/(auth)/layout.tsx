/**
 * Auth shell — minimal centered layout shared by /login and /signup.
 *
 * Matches the editorial feel used in SignupView (Fraunces heading + slate
 * palette + subtle radial speedlines) so the transition from Phase 5 fake
 * signup to real Supabase auth doesn't feel like a product break.
 */

import { Toaster } from "@/components/ui/sonner";
import Image from "next/image";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-10 dark:bg-slate-950"
      style={{
        backgroundImage:
          "radial-gradient(circle at 20% 20%, rgba(76,70,220,0.08), transparent 55%), radial-gradient(circle at 85% 80%, rgba(76,70,220,0.06), transparent 50%)",
      }}
    >
      {/* Speedlines motif echoing SignupView / the landing */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden="true"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg, rgba(76,70,220,0.06) 0 1px, transparent 1px 28px)",
        }}
      />

      <div className="relative z-10 w-full max-w-[440px]">
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
          <a
            href="https://www.autoagente.ai"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 hover:text-[#4C46DC]"
          >
            autoagente.ai ↗
          </a>
        </div>

        {children}

        <p className="mt-6 text-center text-[11px] text-slate-400">
          © 2026 AutoAgente Tecnologia Ltda · CNPJ em constituição · Piloto SP
        </p>
      </div>

      <Toaster richColors position="top-right" />
    </div>
  );
}
