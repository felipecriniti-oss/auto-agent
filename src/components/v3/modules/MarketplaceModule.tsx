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

type SourceFilter = Source | "all";
type MarginFilter = 20 | 25 | 0;
type ScoreFilter = 85 | 90 | 0;

export default function MarketplaceModule(): React.JSX.Element {
  const opportunities = useAppStore((s) => s.opportunities);
  const currentPlan = useAppStore((s) => s.currentPlan);
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
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShoppingCart size={22} className="text-blue-600" />
            Marketplace de Oportunidades
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {filtered.length} {filtered.length === 1 ? "oportunidade" : "oportunidades"} disponíveis
            — agente já negociou preço e exclusividade
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowImportDialog(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm"
        >
          <Sparkles size={16} />+ Importar por URL
        </button>
      </div>

      {/* Tier banner (starter → nudge) */}
      {currentPlan === "starter" && (
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Rocket size={20} />
            </div>
            <div>
              <p className="font-semibold">
                No Premium você economizaria R$ {starterUpgradeSavings.toLocaleString("pt-BR")} em
                fees por mês
              </p>
              <p className="text-xs text-violet-100">
                Fee cai de 6% → 3% · DD ilimitada · prioridade 1h antecipada
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveModule("settings")}
            className="px-4 py-2 bg-white text-violet-700 rounded-lg text-sm font-bold hover:bg-violet-50"
          >
            Ver planos
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase">Fonte</span>
          <FilterPillGroup<SourceFilter>
            value={sourceFilter}
            onChange={setSourceFilter}
            options={[
              { value: "all", label: "Todas" },
              { value: "WebMotors", label: "WebMotors" },
              { value: "Mercado Livre", label: "Mercado Livre" },
              { value: "OLX", label: "OLX" },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase">Margem</span>
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
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase">Score</span>
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
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <ShoppingCart size={36} className="text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700">Nenhuma oportunidade ativa</h3>
          <p className="text-sm text-slate-500 mt-1">
            Importe por URL ou aguarde o agente finalizar uma negociação.
          </p>
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

      {/* Import URL stub dialog */}
      {showImportDialog && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowImportDialog(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowImportDialog(false);
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Sparkles size={20} className="text-blue-600" /> Importar por URL
              </h3>
              <button
                type="button"
                onClick={() => setShowImportDialog(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 text-sm text-violet-800">
              <strong>Apify em breve — Wave 2.</strong> Cole um anúncio de WebMotors / Mercado Livre
              / OLX e o agente irá raspar, enriquecer via FIPE e iniciar negociação automaticamente.
            </div>
            <button
              type="button"
              onClick={() => setShowImportDialog(false)}
              className="w-full mt-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Filter pill group ──────────────────────────────────────────

interface FilterPillGroupProps<T extends string | number> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}

function FilterPillGroup<T extends string | number>({
  value,
  onChange,
  options,
}: FilterPillGroupProps<T>): React.JSX.Element {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            value === opt.value
              ? "bg-blue-600 text-white"
              : "bg-white text-slate-600 border border-slate-200 hover:border-blue-300"
          }`}
        >
          {opt.label}
        </button>
      ))}
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
    <div className="bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all p-4">
      <div className="flex items-start gap-4">
        <div className="w-24 h-20 rounded-lg bg-slate-100 flex items-center justify-center text-3xl flex-shrink-0 border border-slate-200">
          {opp.img}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="text-sm font-semibold text-slate-900 truncate">{opp.vehicle}</h3>
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
                    DD em revisão
                  </Badge>
                )}
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
              </div>
            </div>
            <ScoreRing score={opp.score} size={56} />
          </div>

          {/* Price */}
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-lg font-bold text-emerald-700">
              R$ {opp.dealPrice.toLocaleString("pt-BR")}
            </span>
            <span className="text-xs text-slate-400 line-through">
              R$ {opp.fipe.toLocaleString("pt-BR")}
            </span>
            <span className="text-xs font-semibold text-emerald-600">
              −R$ {opp.savings.toLocaleString("pt-BR")} ({opp.margin}%)
            </span>
          </div>

          <div className="mt-1 text-xs text-slate-500 flex items-center gap-2">
            <MapPin size={11} /> {opp.location} · <Users size={11} /> {opp.sellerName}
          </div>

          {/* Motivation chips */}
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {opp.motivationSignals.slice(0, 3).map((s) => (
              <Badge key={s} variant="warning" size="xs">
                {s}
              </Badge>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Bot size={11} /> {opp.rounds} rodadas
              </span>
              <span className="flex items-center gap-1 text-amber-600 font-medium">
                <Timer size={11} /> {opp.timeLeft}
              </span>
              <span className="text-blue-700 font-medium">
                Fee {planName} ({planFeeLabel}): R$ {fee.toLocaleString("pt-BR")}
              </span>
            </div>
            <button
              type="button"
              onClick={onOpen}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
            >
              <Eye size={12} /> Ver detalhes
            </button>
          </div>
        </div>
      </div>
    </div>
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
