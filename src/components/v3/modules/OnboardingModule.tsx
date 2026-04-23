"use client";

import { plansConfig } from "@/lib/mock-data/v3";
import { useAppStore } from "@/lib/stores/app";
import { useProfile } from "@/lib/supabase/hooks/useProfile";
import { ArrowRight, MessageSquare, Rocket, ShoppingCart, Sparkles } from "lucide-react";

export default function OnboardingModule(): React.JSX.Element {
  const setActiveModule = useAppStore((s) => s.setActiveModule);
  const { data: profile } = useProfile();
  const currentPlan = profile?.plan ?? "starter";
  const plan = plansConfig[currentPlan];

  const profileName = profile?.name ?? null;
  const greeting = profileName ? `Bem-vindo, ${profileName}` : "Bem-vindo ao AutoAgente";
  const personaLabel: string | null = null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 md:p-10">
      <header className="space-y-3 border-b border-slate-200/70 pb-6 dark:border-slate-800">
        <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[#4C46DC]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4C46DC]" />
          Onboarding · primeiros passos
        </div>
        <h1
          className="text-3xl font-semibold leading-[1.05] tracking-tight text-slate-900 md:text-4xl dark:text-slate-50"
          style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
        >
          {greeting}.
        </h1>
        <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
          Seu painel está pronto{personaLabel ? ` (plano ${plan.name} · ${personaLabel})` : ""}.
          Três coisas pra fazer agora pra sentir o produto antes de falar com seu time de vendas.
        </p>
      </header>

      <ol className="space-y-4">
        <StepCard
          index={1}
          title="Rode o Modo Piloto"
          description="O agente faz uma varredura teatral em ~30s e adiciona 5 oportunidades pré-negociadas ao seu Marketplace. Serve pra você ver o pipeline cheio antes de qualquer scrape real."
          icon={Sparkles}
          cta="Ir ao Dashboard"
          onClick={() => setActiveModule("dashboard")}
        />
        <StepCard
          index={2}
          title="Abra uma oportunidade"
          description="Clique em qualquer card do Marketplace. No painel lateral você vê origem do anúncio, motivação do vendedor, histórico da abordagem inicial e o deal-price travado."
          icon={ShoppingCart}
          cta="Abrir Marketplace"
          onClick={() => setActiveModule("marketplace")}
        />
        <StepCard
          index={3}
          title="Acompanhe a negociação no Backstage"
          description="Veja o agente Claude Sonnet 4.6 negociando ao vivo com o vendedor PF simulado — lances, justificativas de FIPE, fechamento. É exatamente o que roda no WhatsApp real quando a Phase 6 entrar."
          icon={MessageSquare}
          cta="Abrir Backstage"
          onClick={() => setActiveModule("backstage")}
        />
      </ol>

      <div className="rounded-2xl border border-slate-200/80 bg-white/60 p-5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/40">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4C46DC]/10 text-[#4C46DC] ring-1 ring-inset ring-[#4C46DC]/20 dark:bg-[#4C46DC]/20">
            <Rocket size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Pronto pra começar de verdade?
            </p>
            <p className="mt-0.5 text-[13px] text-slate-600 dark:text-slate-300">
              Cole uma URL do WebMotors/OLX em <strong>Marketplace → Importar por URL</strong> pra
              ver o scraper rodar ao vivo contra um anúncio real.
            </p>
            <button
              type="button"
              onClick={() => setActiveModule("marketplace")}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#4C46DC] px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_20px_-8px_rgba(76,70,220,0.55)] ring-1 ring-[#4C46DC]/20 transition-all hover:bg-[#3d38b8]"
            >
              Testar scraping real
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StepCardProps {
  index: number;
  title: string;
  description: string;
  icon: typeof Sparkles;
  cta: string;
  onClick: () => void;
}

function StepCard({
  index,
  title,
  description,
  icon: Icon,
  cta,
  onClick,
}: StepCardProps): React.JSX.Element {
  return (
    <li className="group flex items-start gap-4 rounded-xl border border-slate-200/80 bg-white p-5 transition-colors hover:border-[#4C46DC]/40 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200 group-hover:bg-[#4C46DC]/10 group-hover:text-[#4C46DC] group-hover:ring-[#4C46DC]/20 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
          Passo {index}
        </div>
        <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
          {description}
        </p>
        <button
          type="button"
          onClick={onClick}
          className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4C46DC] transition-transform hover:translate-x-0.5"
        >
          {cta}
          <ArrowRight size={12} />
        </button>
      </div>
    </li>
  );
}
