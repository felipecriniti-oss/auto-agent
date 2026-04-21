"use client";

import Badge from "@/components/v3/ui/Badge";
import ChatHistoryView from "@/components/v3/ui/ChatHistoryView";
import ScoreRing from "@/components/v3/ui/ScoreRing";
import SourceBadge from "@/components/v3/ui/SourceBadge";
import TrustPanel from "@/components/v3/ui/TrustPanel";
import {
  type Opportunity,
  type Source,
  calcFee,
  mockChatHistories,
  plansConfig,
} from "@/lib/mock-data/v3";
import { useAppStore } from "@/lib/stores/app";
import {
  AlertTriangle,
  Bot,
  Calendar,
  CheckCircle,
  Clock,
  Eye,
  Gauge,
  Link2,
  Loader2,
  MapPin,
  MessageSquare,
  Palette,
  Rocket,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Timer,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

/**
 * Partial Opportunity returned by /api/scrape/webmotors — fipe/savings/fee/
 * margin are filled client-side after /api/fipe lookup.
 */
type ScrapedOpportunity = Omit<Opportunity, "fipe" | "savings" | "fee" | "margin">;

type ImportStep =
  | { kind: "input" }
  | { kind: "manual_entry" }
  | { kind: "scraping" }
  | { kind: "preview"; opp: ScrapedOpportunity }
  | { kind: "fipe_loading"; opp: ScrapedOpportunity }
  | { kind: "fipe_manual"; opp: ScrapedOpportunity }
  | { kind: "saving"; opp: ScrapedOpportunity; fipe: number };

type SourceFilter = Source | "all";
type MarginFilter = 20 | 25 | 0;
type ScoreFilter = 85 | 90 | 0;

export default function MarketplaceModule(): React.JSX.Element {
  const opportunities = useAppStore((s) => s.opportunities);
  const currentPlan = useAppStore((s) => s.currentPlan);
  const pilotStage = useAppStore((s) => s.pilotStage);
  const assumeDeal = useAppStore((s) => s.assumeDeal);
  const setActiveModule = useAppStore((s) => s.setActiveModule);
  const setActiveOpportunity = useAppStore((s) => s.setActiveOpportunity);

  const plan = plansConfig[currentPlan];

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [marginFilter, setMarginFilter] = useState<MarginFilter>(0);
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const filtered = useMemo<Opportunity[]>(() => {
    return opportunities
      .filter((o) => (sourceFilter === "all" ? true : o.source === sourceFilter))
      .filter((o) => o.margin >= marginFilter)
      .filter((o) => o.score >= scoreFilter);
  }, [opportunities, sourceFilter, marginFilter, scoreFilter]);

  const selected = useMemo<Opportunity | null>(
    () => opportunities.find((o) => o.id === selectedId) ?? null,
    [opportunities, selectedId],
  );

  const openDetails = (id: number): void => setSelectedId(id);
  const closeDetails = (): void => setSelectedId(null);

  const handleAssume = (oppId: number): void => {
    const opp = opportunities.find((o) => o.id === oppId);
    assumeDeal(oppId);
    closeDetails();
    toast.success("Deal assumido!", {
      description: opp ? `${opp.vehicle} movido para Meus Deals.` : "Movido para Meus Deals.",
    });
    setActiveModule("myDeals");
  };

  const handleOpenBackstage = (oppId: number): void => {
    setActiveOpportunity(oppId);
    closeDetails();
    setActiveModule("backstage");
  };

  // Fake "savings if you upgraded" number — MVP nudge copy only
  const fakeMonthSavings = 900;
  const starterUpgradeSavings = currentPlan === "starter" ? 3 * fakeMonthSavings : 0;

  return (
    <div className="space-y-6 p-6 md:p-8">
      {/* Editorial header */}
      <header className="border-b border-slate-200/70 pb-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[#4C46DC]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4C46DC]" />
              Marketplace · oportunidades do dia
            </div>
            <h1
              className="text-4xl font-semibold leading-[1] tracking-tight text-slate-900 md:text-[52px]"
              style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
            >
              Carros <em className="italic text-[#4C46DC]">20 a 30%</em>
              <br />
              abaixo da FIPE.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-600">
              O agente já achou o vendedor, negociou o preço e travou a exclusividade. Você só
              escolhe o carro e assume o deal — paga o fee só na confirmação.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowImportDialog(true)}
            className="group flex shrink-0 items-center gap-2 rounded-lg bg-[#4C46DC] px-5 py-3 text-sm font-semibold text-white shadow-[0_6px_20px_-8px_rgba(76,70,220,0.55)] ring-1 ring-[#4C46DC]/20 transition-all hover:bg-[#3d38b8] hover:shadow-[0_8px_24px_-6px_rgba(76,70,220,0.65)]"
          >
            <Sparkles size={16} className="transition-transform group-hover:scale-110" />
            Importar por URL
          </button>
        </div>

        {/* Stats strip — landing-echoed proof points */}
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-200/60 ring-1 ring-inset ring-slate-200/60 md:grid-cols-4">
          <HeaderStat
            value={filtered.length.toString()}
            label="oportunidades ativas"
            accent="emerald"
          />
          <HeaderStat value="47s" label="por deal" mono />
          <HeaderStat value="−24%" label="vs FIPE · média" accent="violet" />
          <HeaderStat value="7 dias" label="exclusividade sua" />
        </div>
      </header>

      {/* Pilot status banner — appears while "Modo piloto" is running on the Dashboard */}
      {pilotStage === "searching" && (
        <div className="flex items-center gap-3 rounded-xl border border-[#4C46DC]/20 bg-[#4C46DC]/[0.04] px-4 py-3">
          <div className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4C46DC] opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#4C46DC]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4C46DC]">
              Agente trabalhando
            </div>
            <div className="mt-0.5 text-[13px] text-slate-700">
              Varrendo WebMotors, Mercado Livre e OLX em paralelo — novas oportunidades aparecem
              aqui à medida que o agente fecha a negociação com o vendedor.
            </div>
          </div>
        </div>
      )}

      {/* Tier banner (starter → nudge) */}
      {currentPlan === "starter" && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#4C46DC] via-[#5F54DC] to-[#7063E0] p-5 text-white shadow-lg">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, rgba(255,255,255,0.12) 0 1px, transparent 1px 18px)",
            }}
            aria-hidden="true"
          />
          <div className="relative flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 ring-1 ring-inset ring-white/30">
                <Rocket size={20} />
              </div>
              <div>
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-white/70">
                  Migração · Premium
                </div>
                <p className="mt-0.5 text-base font-semibold leading-tight">
                  No Premium você economizaria{" "}
                  <span
                    className="italic"
                    style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
                  >
                    R$ {starterUpgradeSavings.toLocaleString("pt-BR")}
                  </span>{" "}
                  em fees por mês
                </p>
                <p className="mt-1 text-xs text-white/80">
                  Fee cai de 8% → 4% · acesso antecipado 48h · SLA 4h · gerente dedicado
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveModule("settings")}
              className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-bold text-[#4C46DC] shadow-sm transition-colors hover:bg-slate-50"
            >
              Simular break-even →
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-slate-200/80 bg-white/60 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Fonte
          </span>
          <FilterPillGroup<SourceFilter>
            value={sourceFilter}
            onChange={setSourceFilter}
            options={[
              { value: "all", label: "Todas" },
              { value: "WebMotors", label: "WebMotors" },
              { value: "Mercado Livre", label: "ML" },
              { value: "OLX", label: "OLX" },
            ]}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Margem
          </span>
          <FilterPillGroup<MarginFilter>
            value={marginFilter}
            onChange={setMarginFilter}
            options={[
              { value: 0, label: "Todas" },
              { value: 20, label: "≥20%" },
              { value: 25, label: "≥25%" },
            ]}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Score
          </span>
          <FilterPillGroup<ScoreFilter>
            value={scoreFilter}
            onChange={setScoreFilter}
            options={[
              { value: 0, label: "Todos" },
              { value: 85, label: "≥85" },
              { value: 90, label: "≥90" },
            ]}
          />
        </div>
      </div>

      {/* Empty state */}
      {opportunities.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <ShoppingCart size={24} className="text-slate-400" />
          </div>
          <h3
            className="mt-4 text-xl font-semibold text-slate-800"
            style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
          >
            A pista está vazia.
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
            Importe um anúncio real do WebMotors ou aguarde o agente fechar a próxima negociação —
            novas oportunidades aparecem aqui automaticamente.
          </p>
          <button
            type="button"
            onClick={() => setShowImportDialog(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Sparkles size={14} /> Importar primeiro anúncio
          </button>
        </div>
      )}

      {/* Grid */}
      {opportunities.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((opp) => (
            <OpportunityCard
              key={opp.id}
              opp={opp}
              fee={calcFee(opp.savings, currentPlan)}
              planName={plan.name}
              planFeeLabel={plan.feeLabel}
              onOpen={() => openDetails(opp.id)}
            />
          ))}
        </div>
      )}

      {/* Detail drawer/modal */}
      {selected && (
        <OpportunityDrawer
          opp={selected}
          fee={calcFee(selected.savings, currentPlan)}
          planName={plan.name}
          planFeeLabel={plan.feeLabel}
          onClose={closeDetails}
          onAssume={() => handleAssume(selected.id)}
          onOpenBackstage={() => handleOpenBackstage(selected.id)}
        />
      )}

      {/* Import URL dialog — real flow (scrape → fipe → addOpportunity) */}
      {showImportDialog && (
        <ImportUrlDialog onClose={() => setShowImportDialog(false)} currentPlan={currentPlan} />
      )}
    </div>
  );
}

// ─── Import URL dialog ──────────────────────────────────────────
//
// Two-step flow:
//   1. User pastes WebMotors URL → POST /api/scrape/webmotors (10-30s)
//   2. Preview card appears → user clicks "Buscar FIPE e adicionar" →
//      POST /api/fipe → enriches opp with fipe/savings/fee/margin →
//      addOpportunity → dialog closes + toast.
//
// If FIPE returns 404, user gets a manual-input field and can type the
// FIPE value themselves. Other errors keep the dialog open with an inline
// error banner and allow retry.

interface ImportUrlDialogProps {
  onClose: () => void;
  currentPlan: import("@/lib/mock-data/v3").PlanKey;
}

function isWebMotorsUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return /(^|\.)webmotors\.com\.br$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function extractBrandModelForFipe(vehicle: string): { marca: string; modelo: string } | null {
  const parts = vehicle.trim().split(/\s+/);
  if (parts.length < 2) return null;
  return { marca: parts[0], modelo: parts.slice(1).join(" ") };
}

function ImportUrlDialog({ onClose, currentPlan }: ImportUrlDialogProps): React.JSX.Element {
  const addOpportunity = useAppStore((s) => s.addOpportunity);

  const [url, setUrl] = useState("");
  const [step, setStep] = useState<ImportStep>({ kind: "input" });
  const [error, setError] = useState<string | null>(null);
  const [manualFipe, setManualFipe] = useState("");

  // Manual entry fields (backup path when scraping fails or user prefers to type)
  const [manualForm, setManualForm] = useState({
    marca: "",
    modelo: "",
    ano: "",
    km: "",
    precoPedido: "",
    cidade: "",
    sellerName: "",
    fipe: "",
  });

  const busy = step.kind === "scraping" || step.kind === "fipe_loading" || step.kind === "saving";

  const closeIfIdle = (): void => {
    if (!busy) onClose();
  };

  const handleScrape = async (): Promise<void> => {
    setError(null);
    if (!isWebMotorsUrl(url)) {
      setError("URL inválida — só WebMotors (webmotors.com.br) é suportado nesta versão.");
      return;
    }
    setStep({ kind: "scraping" });
    try {
      const res = await fetch("/api/scrape/webmotors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        setStep({ kind: "input" });
        if (res.status === 429) {
          setError("Muitas tentativas — aguarde 1 minuto e tente novamente.");
        } else if (res.status === 504 || data.error === "scrape_timeout") {
          setError(
            "Timeout no scraping — WebMotors tem proteção anti-bot agressiva. Use a entrada manual abaixo.",
          );
        } else if (data.error === "apify_token_missing") {
          setError("APIFY_API_TOKEN não configurado no Vercel. Use a entrada manual abaixo.");
        } else if (data.error === "only_webmotors_supported") {
          setError("Só WebMotors é suportado via URL. Use a entrada manual pra outras fontes.");
        } else {
          // Surface the Apify detail when present — helps diagnose actor/shape issues
          const detail = data.detail ? ` · ${data.detail.slice(0, 120)}` : "";
          setError(
            `Falha no scraping (${data.error ?? res.status}${detail}). Use a entrada manual abaixo.`,
          );
        }
        return;
      }
      const data = (await res.json()) as { opportunity: ScrapedOpportunity };
      setStep({ kind: "preview", opp: data.opportunity });
    } catch (err) {
      setStep({ kind: "input" });
      setError(`Erro de rede: ${(err as Error).message}`);
    }
  };

  const finalizeWithFipe = (opp: ScrapedOpportunity, fipe: number): void => {
    const savings = Math.max(0, fipe - opp.dealPrice);
    const fee = calcFee(savings, currentPlan);
    const margin = fipe > 0 ? Math.round((savings / fipe) * 100) : 0;
    const finalOpp: Opportunity = {
      ...opp,
      fipe,
      savings,
      fee,
      margin,
    };
    addOpportunity(finalOpp);
    toast.success("Oportunidade adicionada!", {
      description: `${finalOpp.vehicle} — economia estimada R$ ${savings.toLocaleString("pt-BR")}.`,
    });
    onClose();
  };

  const handleFipeLookup = async (opp: ScrapedOpportunity): Promise<void> => {
    setError(null);
    const bm = extractBrandModelForFipe(opp.vehicle);
    if (!bm || !opp.year) {
      setStep({ kind: "fipe_manual", opp });
      return;
    }
    setStep({ kind: "fipe_loading", opp });
    try {
      const res = await fetch("/api/fipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marca: bm.marca, modelo: bm.modelo, ano: opp.year }),
      });
      if (res.status === 404) {
        setStep({ kind: "fipe_manual", opp });
        setError("FIPE não encontrou o modelo — informe o valor manualmente.");
        return;
      }
      if (!res.ok) {
        setStep({ kind: "fipe_manual", opp });
        setError(`FIPE indisponível (${res.status}) — informe o valor manualmente.`);
        return;
      }
      const data = (await res.json()) as { fipe: number };
      setStep({ kind: "saving", opp, fipe: data.fipe });
      finalizeWithFipe(opp, data.fipe);
    } catch (err) {
      setStep({ kind: "fipe_manual", opp });
      setError(`Erro na consulta FIPE: ${(err as Error).message}`);
    }
  };

  const handleManualFipeSubmit = (opp: ScrapedOpportunity): void => {
    const parsed = Number(manualFipe.replace(/[^0-9]/g, ""));
    if (!parsed || parsed < 1000) {
      setError("Valor FIPE inválido — informe um número maior que R$ 1.000.");
      return;
    }
    setStep({ kind: "saving", opp, fipe: parsed });
    finalizeWithFipe(opp, parsed);
  };

  const handleManualEntrySubmit = (): void => {
    setError(null);
    const ano = Number(manualForm.ano.replace(/[^0-9]/g, ""));
    const km = Number(manualForm.km.replace(/[^0-9]/g, ""));
    const precoPedido = Number(manualForm.precoPedido.replace(/[^0-9]/g, ""));
    const fipe = Number(manualForm.fipe.replace(/[^0-9]/g, ""));
    if (
      !manualForm.marca.trim() ||
      !manualForm.modelo.trim() ||
      ano < 1990 ||
      ano > 2030 ||
      km <= 0 ||
      precoPedido < 1000 ||
      fipe < 1000 ||
      !manualForm.cidade.trim()
    ) {
      setError("Preencha marca, modelo, ano (1990-2030), km, preço pedido e FIPE (>= R$ 1.000).");
      return;
    }
    const savings = Math.max(0, fipe - precoPedido);
    const margin = fipe > 0 ? Math.round((savings / fipe) * 100) : 0;
    const fee = calcFee(savings, currentPlan);
    const finalOpp: Opportunity = {
      id: Date.now(),
      vehicle: `${manualForm.marca.trim()} ${manualForm.modelo.trim()}`,
      year: ano,
      km,
      dealPrice: precoPedido,
      fipe,
      savings,
      fee,
      margin,
      score: Math.min(95, 70 + Math.floor(margin / 2)),
      location: manualForm.cidade.trim(),
      sellerName: manualForm.sellerName.trim() || "Anunciante",
      img: "🚗",
      color: "—",
      fuel: "—",
      rounds: 0,
      motivationSignals: [],
      ddStatus: "review",
      timeLeft: "7d 00h",
      source: "WebMotors",
    };
    addOpportunity(finalOpp);
    toast.success("Oportunidade adicionada!", {
      description: `${finalOpp.vehicle} — economia R$ ${savings.toLocaleString("pt-BR")} (${margin}% vs FIPE).`,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4"
      onClick={closeIfIdle}
      onKeyDown={(e) => {
        if (e.key === "Escape") closeIfIdle();
      }}
      // biome-ignore lint/a11y/useSemanticElements: overlay div — the semantic dialog lives inside this backdrop
      role="dialog"
      aria-modal="true"
      aria-label="Importar por URL"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Sparkles size={20} className="text-blue-600" /> Importar por URL
          </h3>
          <button
            type="button"
            onClick={closeIfIdle}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
            aria-label="Fechar"
            disabled={busy}
          >
            <X size={20} />
          </button>
        </div>

        {/* Step: input */}
        {step.kind === "input" && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600 uppercase">
                URL do WebMotors
              </span>
              <div className="mt-1 flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 focus-within:border-blue-400">
                <Link2 size={16} className="text-slate-400 flex-shrink-0" />
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.webmotors.com.br/comprar/..."
                  className="flex-1 text-sm outline-none bg-transparent"
                />
              </div>
            </label>
            <p className="text-xs text-slate-500">
              Cole a URL do anúncio do WebMotors. O agente extrai os dados e consulta a FIPE
              automaticamente.
            </p>
            {error && <InlineError message={error} />}
            <button
              type="button"
              onClick={handleScrape}
              disabled={!url.trim()}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Sparkles size={14} /> Importar por URL
            </button>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                ou
              </span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep({ kind: "manual_entry" });
              }}
              className="w-full py-2.5 border border-slate-200 hover:border-[#4C46DC]/40 text-slate-700 hover:text-[#4C46DC] rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              Preencher anúncio manualmente
            </button>
            <p className="text-[11px] text-slate-400 text-center">
              Scraping real depende do Apify + anti-bot do WebMotors. A entrada manual funciona
              sempre e gera a mesma oportunidade no Marketplace.
            </p>
          </div>
        )}

        {/* Step: manual_entry */}
        {step.kind === "manual_entry" && (
          <div className="space-y-3">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
              Cole os dados do anúncio real (WebMotors, OLX, Mercado Livre). O agente usa isso como
              ponto de partida da negociação.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ManualField
                label="Marca"
                value={manualForm.marca}
                onChange={(v) => setManualForm({ ...manualForm, marca: v })}
                placeholder="Audi"
              />
              <ManualField
                label="Modelo"
                value={manualForm.modelo}
                onChange={(v) => setManualForm({ ...manualForm, modelo: v })}
                placeholder="Q5 Performance"
              />
              <ManualField
                label="Ano"
                value={manualForm.ano}
                onChange={(v) => setManualForm({ ...manualForm, ano: v })}
                placeholder="2023"
                inputMode="numeric"
              />
              <ManualField
                label="Km"
                value={manualForm.km}
                onChange={(v) => setManualForm({ ...manualForm, km: v })}
                placeholder="28000"
                inputMode="numeric"
              />
              <ManualField
                label="Preço pedido (R$)"
                value={manualForm.precoPedido}
                onChange={(v) => setManualForm({ ...manualForm, precoPedido: v })}
                placeholder="198000"
                inputMode="numeric"
              />
              <ManualField
                label="FIPE (R$)"
                value={manualForm.fipe}
                onChange={(v) => setManualForm({ ...manualForm, fipe: v })}
                placeholder="268000"
                inputMode="numeric"
              />
              <ManualField
                label="Cidade"
                value={manualForm.cidade}
                onChange={(v) => setManualForm({ ...manualForm, cidade: v })}
                placeholder="Moema, SP"
              />
              <ManualField
                label="Vendedor"
                value={manualForm.sellerName}
                onChange={(v) => setManualForm({ ...manualForm, sellerName: v })}
                placeholder="Marcos R."
              />
            </div>
            {error && <InlineError message={error} />}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep({ kind: "input" });
                }}
                className="flex-1 py-2.5 border border-slate-200 hover:border-slate-300 text-slate-700 rounded-lg text-sm font-medium"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleManualEntrySubmit}
                className="flex-1 py-2.5 bg-[#4C46DC] hover:bg-[#3d38b8] text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Sparkles size={14} /> Adicionar ao Marketplace
              </button>
            </div>
          </div>
        )}

        {/* Step: scraping */}
        {step.kind === "scraping" && (
          <StepProgress
            icon={<Loader2 size={18} className="animate-spin" />}
            title="Escaneando WebMotors…"
            description="Isso pode levar entre 10 e 30 segundos — o Apify boota uma instância headless para raspar o anúncio."
          />
        )}

        {/* Step: preview scraped opp */}
        {step.kind === "preview" && (
          <PreviewCard opp={step.opp} onConfirm={() => handleFipeLookup(step.opp)}>
            {error && <InlineError message={error} />}
          </PreviewCard>
        )}

        {/* Step: fipe loading */}
        {step.kind === "fipe_loading" && (
          <StepProgress
            icon={<Loader2 size={18} className="animate-spin" />}
            title="Consultando FIPE…"
            description={`Buscando valor de tabela para ${step.opp.vehicle} (${step.opp.year}).`}
          />
        )}

        {/* Step: fipe manual fallback */}
        {step.kind === "fipe_manual" && (
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <strong>FIPE não disponível.</strong> Informe o valor manualmente — use a tabela
              oficial em{" "}
              <a
                href="https://veiculos.fipe.org.br"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                veiculos.fipe.org.br
              </a>
              .
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600 uppercase">
                Valor FIPE (R$)
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={manualFipe}
                onChange={(e) => setManualFipe(e.target.value)}
                placeholder="Ex: 85000"
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
            </label>
            {error && <InlineError message={error} />}
            <button
              type="button"
              onClick={() => handleManualFipeSubmit(step.opp)}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold"
            >
              Adicionar ao Marketplace
            </button>
          </div>
        )}

        {/* Step: saving (brief — we finalize synchronously after fipe). */}
        {step.kind === "saving" && (
          <StepProgress
            icon={<Loader2 size={18} className="animate-spin" />}
            title="Adicionando ao Marketplace…"
            description=""
          />
        )}
      </div>
    </div>
  );
}

function InlineError({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-start gap-2">
      <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

interface ManualFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "numeric" | "text";
}

function ManualField({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: ManualFieldProps): React.JSX.Element {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#4C46DC] focus:ring-4 focus:ring-[#4C46DC]/10"
      />
    </label>
  );
}

interface StepProgressProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function StepProgress({ icon, title, description }: StepProgressProps): React.JSX.Element {
  return (
    <div className="py-6 text-center space-y-2">
      <div className="flex items-center justify-center text-blue-600">{icon}</div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {description && <p className="text-xs text-slate-500">{description}</p>}
    </div>
  );
}

interface PreviewCardProps {
  opp: ScrapedOpportunity;
  onConfirm: () => void;
  children?: React.ReactNode;
}

function PreviewCard({ opp, onConfirm, children }: PreviewCardProps): React.JSX.Element {
  return (
    <div className="space-y-3">
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
        <p className="text-sm font-semibold text-slate-900">{opp.vehicle || "Sem título"}</p>
        <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
          <span className="flex items-center gap-1">
            <Calendar size={11} /> {opp.year || "—"}
          </span>
          <span className="flex items-center gap-1">
            <Gauge size={11} /> {opp.km ? `${opp.km.toLocaleString("pt-BR")} km` : "—"}
          </span>
          <span className="flex items-center gap-1">
            <MapPin size={11} /> {opp.location}
          </span>
        </div>
        <p className="text-base font-bold text-emerald-700">
          R$ {opp.dealPrice.toLocaleString("pt-BR")}
        </p>
        {opp.motivationSignals.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap pt-1">
            {opp.motivationSignals.map((s) => (
              <Badge key={s} variant="warning" size="xs">
                {s}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {children}
      <button
        type="button"
        onClick={onConfirm}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
      >
        <Sparkles size={14} /> Buscar FIPE e adicionar
      </button>
    </div>
  );
}

// ─── Filter pill group ──────────────────────────────────────────

interface FilterPillGroupProps<T extends string | number> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}

// ─── Header stat cell ───────────────────────────────────────────

interface HeaderStatProps {
  value: string;
  label: string;
  accent?: "emerald" | "violet";
  mono?: boolean;
}

function HeaderStat({ value, label, accent, mono }: HeaderStatProps): React.JSX.Element {
  const valueClass =
    accent === "emerald"
      ? "text-emerald-600"
      : accent === "violet"
        ? "text-[#4C46DC]"
        : "text-slate-900";
  const fontStyle = mono
    ? { fontFamily: "var(--font-jetbrains-mono, ui-monospace)" }
    : { fontFamily: "var(--font-fraunces, Georgia, serif)" };
  return (
    <div className="bg-white px-4 py-3">
      <div className={`text-xl font-semibold leading-none ${valueClass}`} style={fontStyle}>
        {value}
      </div>
      <div className="mt-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
    </div>
  );
}

function FilterPillGroup<T extends string | number>({
  value,
  onChange,
  options,
}: FilterPillGroupProps<T>): React.JSX.Element {
  return (
    <div className="inline-flex rounded-lg bg-slate-100/80 p-0.5 ring-1 ring-inset ring-slate-200/60">
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
              isActive
                ? "bg-white text-[#4C46DC] shadow-sm ring-1 ring-inset ring-[#4C46DC]/15"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Opportunity card ───────────────────────────────────────────

interface OpportunityCardProps {
  opp: Opportunity;
  fee: number;
  planName: string;
  planFeeLabel: string;
  onOpen: () => void;
}

function OpportunityCard({
  opp,
  fee,
  planName,
  planFeeLabel,
  onOpen,
}: OpportunityCardProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white text-left shadow-[0_1px_2px_0_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#4C46DC]/30 hover:shadow-[0_10px_28px_-12px_rgba(76,70,220,0.25)]"
    >
      {/* Top stripe with vehicle hero */}
      <div className="flex items-start justify-between gap-4 bg-gradient-to-br from-slate-50 to-white p-5 pb-4">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-white text-4xl shadow-sm ring-1 ring-inset ring-slate-200/70">
            {opp.img}
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <SourceBadge source={opp.source} />
              {opp.ddStatus === "ok" && (
                <Badge variant="success" size="xs">
                  <ShieldCheck size={10} className="mr-0.5" />
                  DD ok
                </Badge>
              )}
              {opp.ddStatus === "review" && (
                <Badge variant="warning" size="xs">
                  <AlertTriangle size={10} className="mr-0.5" />
                  DD revisão
                </Badge>
              )}
            </div>
            <h3
              className="text-lg font-semibold leading-tight tracking-tight text-slate-900"
              style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
            >
              {opp.vehicle}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <Calendar size={11} /> {opp.year}
              </span>
              <span className="flex items-center gap-1">
                <Gauge size={11} /> {opp.km.toLocaleString("pt-BR")} km
              </span>
              <span className="flex items-center gap-1 text-slate-400">· {opp.fuel}</span>
            </div>
          </div>
        </div>
        <ScoreRing score={opp.score} size={56} />
      </div>

      {/* Price + savings block */}
      <div className="flex items-end justify-between gap-3 border-t border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Fechado pelo agente
          </div>
          <div className="mt-0.5 font-mono text-[28px] font-semibold leading-none tracking-tight text-slate-900">
            R$ {opp.dealPrice.toLocaleString("pt-BR")}
          </div>
          <div className="mt-1 font-mono text-[11px] text-slate-400">
            FIPE <span className="line-through">R$ {opp.fipe.toLocaleString("pt-BR")}</span>
          </div>
        </div>
        <div className="shrink-0 rounded-xl bg-emerald-50 px-3 py-2 text-right ring-1 ring-inset ring-emerald-100">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700/70">
            vs FIPE
          </div>
          <div
            className="font-semibold leading-none text-emerald-700 italic"
            style={{ fontFamily: "var(--font-fraunces, Georgia, serif)", fontSize: "22px" }}
          >
            −{opp.margin}%
          </div>
          <div className="mt-1 font-mono text-[10px] text-emerald-700/80">
            −R$ {opp.savings.toLocaleString("pt-BR")}
          </div>
        </div>
      </div>

      {/* Context row */}
      <div className="flex items-center gap-x-3 gap-y-1 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <MapPin size={11} /> {opp.location}
        </span>
        <span className="text-slate-300">·</span>
        <span className="flex items-center gap-1">
          <Users size={11} /> {opp.sellerName}
        </span>
      </div>

      {/* Top motivation signal — only the strongest one surfaces on the card */}
      {opp.motivationSignals.length > 0 && (
        <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-2.5">
          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200/70">
            {opp.motivationSignals[0]}
          </span>
          {opp.motivationSignals.length > 1 && (
            <span className="font-mono text-[10px] text-slate-400">
              +{opp.motivationSignals.length - 1}
            </span>
          )}
        </div>
      )}

      {/* Footer — timer + fee + CTA */}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
        <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-amber-600">
          <Timer size={12} /> {opp.timeLeft}
        </span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-slate-500">
            fee{" "}
            <span className="font-semibold text-slate-900">R$ {fee.toLocaleString("pt-BR")}</span>
          </span>
          <span
            aria-hidden="true"
            className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors group-hover:bg-[#4C46DC]"
          >
            Ver detalhes
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Opportunity detail drawer ──────────────────────────────────

interface OpportunityDrawerProps {
  opp: Opportunity;
  fee: number;
  planName: string;
  planFeeLabel: string;
  onClose: () => void;
  onAssume: () => void;
  onOpenBackstage: () => void;
}

function OpportunityDrawer({
  opp,
  fee,
  planName,
  planFeeLabel,
  onClose,
  onAssume,
  onOpenBackstage,
}: OpportunityDrawerProps): React.JSX.Element {
  const history = mockChatHistories[opp.id];

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      // biome-ignore lint/a11y/useSemanticElements: overlay div — the semantic dialog lives inside this backdrop
      role="dialog"
      aria-modal="true"
      aria-label={opp.vehicle}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-200">
          <div className="flex items-start gap-4">
            <div className="w-16 h-14 rounded-lg bg-slate-100 flex items-center justify-center text-3xl border border-slate-200">
              {opp.img}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="text-lg font-bold text-slate-900">{opp.vehicle}</h3>
                <SourceBadge source={opp.source} />
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar size={11} /> {opp.year}
                </span>
                <span className="flex items-center gap-1">
                  <Gauge size={11} /> {opp.km.toLocaleString("pt-BR")} km
                </span>
                <span className="flex items-center gap-1">⛽ {opp.fuel}</span>
                <span className="flex items-center gap-1">
                  <Palette size={11} /> {opp.color}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin size={11} /> {opp.location}
                </span>
                <span className="flex items-center gap-1 text-amber-600 font-medium">
                  <Timer size={11} /> Exclusividade: {opp.timeLeft}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Fechar"
          >
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-3 gap-5 bg-slate-50">
          {/* Left: pricing + chat history */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">FIPE</p>
                  <p className="text-base font-bold text-slate-700">
                    R$ {(opp.fipe / 1000).toFixed(0)}k
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Preço acordado</p>
                  <p className="text-base font-bold text-slate-900">
                    R$ {(opp.dealPrice / 1000).toFixed(0)}k
                  </p>
                </div>
                <div>
                  <p className="text-xs text-emerald-600 mb-0.5 font-medium">Economia</p>
                  <p className="text-base font-bold text-emerald-700">
                    R$ {(opp.savings / 1000).toFixed(0)}k
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Margem</p>
                  <p className="text-base font-bold text-emerald-700">{opp.margin}%</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
                {opp.motivationSignals.map((s) => (
                  <Badge key={s} variant="warning" size="xs">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <MessageSquare size={14} className="text-blue-600" /> Conversa do agente com{" "}
                  {opp.sellerName}
                </h4>
                <span className="text-xs text-slate-400">
                  {history ? `${history.length} mensagens · ${opp.rounds} rodadas` : "—"}
                </span>
              </div>
              {history ? (
                <ChatHistoryView history={history} sellerName={opp.sellerName} />
              ) : (
                <div className="text-center py-8 text-sm text-slate-500 flex flex-col items-center gap-2">
                  <Bot size={32} className="text-slate-300" />
                  Agente ainda não iniciou conversa.
                </div>
              )}
            </div>
          </div>

          {/* Right: action card + trust */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border-2 border-blue-200 p-4 space-y-3">
              <div className="text-center pb-3 border-b border-slate-100">
                <p className="text-xs text-slate-500 mb-1">Você economiza</p>
                <p className="text-2xl font-bold text-emerald-700">
                  R$ {opp.savings.toLocaleString("pt-BR")}
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  Fee {planName} ({planFeeLabel})
                </p>
                <p className="text-3xl font-bold text-slate-900">
                  R$ {fee.toLocaleString("pt-BR")}
                </p>
                <p className="text-xs text-slate-400 mt-1">Pago só ao assumir</p>
              </div>
              <button
                type="button"
                onClick={onAssume}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-200"
              >
                <Zap size={16} /> Assumir Deal
              </button>
              <button
                type="button"
                onClick={onOpenBackstage}
                className="w-full py-2 bg-white border border-slate-200 hover:border-blue-300 text-slate-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
              >
                <Bot size={14} /> Ver backstage ao vivo
              </button>
              <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle size={14} className="text-emerald-600" />
                  <p className="text-xs font-bold text-emerald-800">100% garantido</p>
                </div>
                <p className="text-xs text-emerald-700">
                  Reembolso integral se o vendedor desistir nos 7 dias de exclusividade.
                </p>
              </div>
            </div>

            <TrustPanel inline />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Clock size={12} /> Negociação concluída
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle size={12} className="text-emerald-600" /> Exclusividade firmada
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-lg text-sm font-medium"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
