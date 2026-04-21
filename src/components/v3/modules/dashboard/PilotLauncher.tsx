"use client";

import { pilotOpportunities } from "@/lib/mock-data/pilot";
import { useAppStore } from "@/lib/stores/app";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * "Modo piloto" launcher — runs a scripted sequence that drip-feeds 5 new
 * opportunities into the Marketplace over ~30 seconds, accompanied by toast
 * progress. Designed to feel like the agent is actively scraping and
 * qualifying deals during the demo.
 *
 * Intentionally NOT wired to /api/scrape/webmotors or Apify — live scraping
 * during a demo is a liability (API downtime, rate limits). The existing
 * "Importar por URL" button on Marketplace still exists for demonstrating
 * real scraping on-demand.
 */
export default function PilotLauncher(): React.JSX.Element {
  const pilotStage = useAppStore((s) => s.pilotStage);
  const startPilotStage = useAppStore((s) => s.startPilotStage);
  const addOpportunity = useAppStore((s) => s.addOpportunity);
  const markOpportunityAutoMode = useAppStore((s) => s.markOpportunityAutoMode);
  const setActiveModule = useAppStore((s) => s.setActiveModule);
  const existingOpps = useAppStore((s) => s.opportunities);

  const running = pilotStage === "searching";

  const runPilot = useCallback(async (): Promise<void> => {
    if (running) return;

    // Filter out pilot opps that are already in the marketplace (re-runs idempotent)
    const existingIds = new Set(existingOpps.map((o) => o.id));
    const toAdd = pilotOpportunities.filter((o) => !existingIds.has(o.id));
    if (toAdd.length === 0) {
      toast.info("As 5 oportunidades do piloto já estão no seu marketplace.", {
        description: "Abra uma e clique em Backstage pra ver o agente negociando ao vivo.",
      });
      setActiveModule("marketplace");
      return;
    }

    startPilotStage("searching");
    setActiveModule("marketplace");

    toast.loading("Agente varrendo WebMotors + Mercado Livre + OLX em tempo real...", {
      id: "pilot-run",
      duration: 30000,
    });

    // Drip-feed the new opps with slight jitter to feel alive
    for (let i = 0; i < toAdd.length; i++) {
      const delay = i === 0 ? 2200 : 3800 + Math.floor(Math.random() * 1800);
      await sleep(delay);
      addOpportunity(toAdd[i]);
      markOpportunityAutoMode(toAdd[i].id, true);
      toast.loading(`${i + 1}/${toAdd.length} oportunidades encontradas · ${toAdd[i].vehicle}`, {
        id: "pilot-run",
        duration: 30000,
      });
    }

    await sleep(1200);
    startPilotStage("done");

    const avgMargin = Math.round(toAdd.reduce((sum, o) => sum + o.margin, 0) / toAdd.length);
    const totalSavings = toAdd.reduce((sum, o) => sum + o.savings, 0);

    toast.success(`${toAdd.length} oportunidades ao vivo · −${avgMargin}% médio vs FIPE`, {
      id: "pilot-run",
      description: `Economia agregada potencial: R$ ${totalSavings.toLocaleString("pt-BR")}. Clique em qualquer card pra abrir o Backstage.`,
      duration: 8000,
    });
  }, [
    running,
    existingOpps,
    startPilotStage,
    setActiveModule,
    addOpportunity,
    markOpportunityAutoMode,
  ]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#4C46DC] via-[#5F54DC] to-[#7063E0] p-6 text-white shadow-lg">
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg, rgba(255,255,255,0.12) 0 1px, transparent 1px 22px)",
        }}
        aria-hidden="true"
      />
      <div className="relative flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
        <div className="max-w-lg">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-white/70">
            Modo piloto · demonstração ao vivo
          </div>
          <h3
            className="mt-1 text-xl font-semibold leading-tight md:text-2xl"
            style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
          >
            Quer ver o agente <em className="italic">em ação</em> agora?
          </h3>
          <p className="mt-2 text-[13px] leading-snug text-white/85">
            Rode o piloto e o agente faz uma varredura ao vivo. Em ~30 segundos, 5 oportunidades
            novas aparecem no seu marketplace — com score, origem, motivação do vendedor e histórico
            de negociação pronto pra assumir.
          </p>
        </div>
        <button
          type="button"
          onClick={runPilot}
          disabled={running}
          className="group flex shrink-0 items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-bold text-[#4C46DC] shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70"
        >
          {running ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Agente varrendo...
            </>
          ) : (
            <>
              <Sparkles size={16} className="transition-transform group-hover:scale-110" />
              Iniciar modo piloto
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
