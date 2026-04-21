"use client";

import { ChatView } from "@/components/negotiation/ChatView";
import { ContextPanel } from "@/components/negotiation/ContextPanel";
import { KillSwitchBanner } from "@/components/negotiation/KillSwitchBanner";
import { SummaryPanel } from "@/components/negotiation/SummaryPanel";
import { Toaster } from "@/components/ui/sonner";
import Badge from "@/components/v3/ui/Badge";
import ChatHistoryView from "@/components/v3/ui/ChatHistoryView";
import ScoreRing from "@/components/v3/ui/ScoreRing";
import SourceBadge from "@/components/v3/ui/SourceBadge";
import { mockChatHistories } from "@/lib/mock-data/v3";
import { useAppStore } from "@/lib/stores/app";
import { useNegotiationStore } from "@/lib/stores/negotiation";
import {
  ArrowLeft,
  Bot,
  Calendar,
  ChevronDown,
  ChevronUp,
  Gauge,
  MapPin,
  MessageSquare,
  Play,
  ShoppingCart,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import AutoplayBackstage from "./backstage/AutoplayBackstage";
import { buildListingFromOpportunity } from "./backstage/helpers";

/**
 * BackstageModule — live chat where Claude Sonnet 4.6 negotiates as the buyer
 * against a simulated PF (the user types as PF for now — simulated PF bot is
 * a later phase). Reads activeOpportunityId from the app store, loads that
 * opportunity's data, pre-populates the Phase 1 negotiation machinery, and
 * renders the live chat.
 *
 * Design: Phase 1 components (ChatView, ContextPanel, SummaryPanel,
 * NegotiationStatusBar, KillSwitchBanner) are reused verbatim — we never
 * modify them. We drive them by calling the same actions AdListingForm /
 * PlaygroundModule call (initSession → startNegotiating), but with values
 * derived from the Opportunity via buildListingFromOpportunity().
 */
export default function BackstageModule(): React.JSX.Element {
  const {
    activeOpportunityId,
    opportunities,
    setActiveModule,
    setActiveOpportunity,
    autoModeOpportunityIds,
  } = useAppStore(
    useShallow((s) => ({
      activeOpportunityId: s.activeOpportunityId,
      opportunities: s.opportunities,
      setActiveModule: s.setActiveModule,
      setActiveOpportunity: s.setActiveOpportunity,
      autoModeOpportunityIds: s.autoModeOpportunityIds,
    })),
  );

  const { session, initSession, startNegotiating, newNegotiation } = useNegotiationStore(
    useShallow((s) => ({
      session: s.currentSession,
      initSession: s.initSession,
      startNegotiating: s.startNegotiating,
      newNegotiation: s.newNegotiation,
    })),
  );

  const [historyOpen, setHistoryOpen] = useState(false);
  const [killSwitchTripped, setKillSwitchTripped] = useState(false);

  const opp = opportunities.find((o) => o.id === activeOpportunityId) ?? null;
  const history = opp ? mockChatHistories[opp.id] : undefined;
  const status = session?.status ?? "idle";

  // The live session is "bound" to this opportunity if we've initialized it
  // from this opp's values. Cheapest correct check: compare precoPedido —
  // opportunity dealPrices are distinct in the mock set and any fresh bootstrap
  // will overwrite it. Also require the marca to match (belt + suspenders).
  const sessionBoundToOpp =
    opp !== null &&
    session !== null &&
    session.listing.precoPedido === opp.dealPrice &&
    session.fipe === opp.fipe;

  function handleBackToMarketplace(): void {
    // Clear any negotiation state so it doesn't leak between opportunities.
    newNegotiation();
    setActiveOpportunity(null);
    setActiveModule("marketplace");
  }

  function handleStartNegotiation(): void {
    if (!opp) return;
    const listing = buildListingFromOpportunity(opp);
    // initSession replicates the successful AdListingForm submit path with
    // programmatic values — same contract, no form-event required.
    initSession(listing, opp.fipe);
    startNegotiating();
  }

  // ─── Empty state ───────────────────────────────────────────────
  if (!opp) {
    return (
      <div className="space-y-6 p-6">
        <BackstageHeader
          title="Nenhuma oportunidade selecionada"
          subtitle={null}
          onBack={() => setActiveModule("marketplace")}
          onClose={null}
        />
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <ShoppingCart size={36} className="text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700">
            Selecione uma oportunidade no Marketplace para ver o agente em ação
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            O Backstage mostra a negociação ao vivo entre o agente e o vendedor PF.
          </p>
          <button
            type="button"
            onClick={() => setActiveModule("marketplace")}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold inline-flex items-center gap-2"
          >
            <ShoppingCart size={14} /> Ir ao Marketplace
          </button>
        </div>
      </div>
    );
  }

  // ─── Active opportunity ────────────────────────────────────────
  const statusLabel =
    status === "negotiating"
      ? "Negociando ao vivo"
      : status === "ended"
        ? "Negociação encerrada"
        : "Aguardando início";

  const statusVariant =
    status === "negotiating" ? "success" : status === "ended" ? "accent" : "warning";

  return (
    <>
      <KillSwitchBanner visible={killSwitchTripped} />
      <Toaster richColors position="top-right" />
      <div className="space-y-6 p-6">
        <BackstageHeader
          title={`Backstage · ${opp.vehicle}`}
          subtitle={
            <Badge variant={statusVariant} size="sm">
              {statusLabel}
            </Badge>
          }
          onBack={handleBackToMarketplace}
          onClose={handleBackToMarketplace}
        />

        {/* Opportunity context strip */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-start gap-4 flex-wrap lg:flex-nowrap">
            <div className="w-16 h-14 rounded-lg bg-slate-100 flex items-center justify-center text-3xl border border-slate-200 flex-shrink-0">
              {opp.img}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-900 truncate">{opp.vehicle}</span>
                <SourceBadge source={opp.source} />
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar size={11} /> {opp.year}
                </span>
                <span className="flex items-center gap-1">
                  <Gauge size={11} /> {opp.km.toLocaleString("pt-BR")} km
                </span>
                <span className="flex items-center gap-1">
                  <MapPin size={11} /> {opp.location}
                </span>
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-base font-bold text-emerald-700">
                  R$ {opp.dealPrice.toLocaleString("pt-BR")}
                </span>
                <span className="text-xs text-slate-400 line-through">
                  FIPE R$ {opp.fipe.toLocaleString("pt-BR")}
                </span>
                <span className="text-xs font-semibold text-emerald-600">
                  −R$ {opp.savings.toLocaleString("pt-BR")} ({opp.margin}%)
                </span>
              </div>
              <div className="flex items-center gap-1 flex-wrap pt-1">
                {opp.motivationSignals.map((s) => (
                  <Badge key={s} variant="warning" size="xs">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex-shrink-0">
              <ScoreRing score={opp.score} size={56} />
            </div>
          </div>
        </div>

        {/* Prior chat history (collapsible) */}
        <div className="bg-white rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-blue-600" />
              <span className="text-sm font-semibold text-slate-700">
                Histórico da abordagem inicial
              </span>
              {history ? (
                <span className="text-xs text-slate-500">
                  Ver histórico da abordagem ({history.length} mensagens)
                </span>
              ) : (
                <span className="text-xs text-slate-500">Sem histórico prévio</span>
              )}
            </div>
            {historyOpen ? (
              <ChevronUp size={16} className="text-slate-500" />
            ) : (
              <ChevronDown size={16} className="text-slate-500" />
            )}
          </button>
          {historyOpen ? (
            <div className="border-t border-slate-200 p-4">
              {history ? (
                <ChatHistoryView history={history} sellerName={opp.sellerName} />
              ) : (
                <div className="text-sm text-slate-500 text-center py-6">
                  Esta oportunidade não tem histórico prévio. A negociação começa do zero.
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Live chat area — autoplay path (agent vs simulated PF) or solo chat */}
        {autoModeOpportunityIds.includes(opp.id) ? (
          <AutoplayBackstage opp={opp} />
        ) : !sessionBoundToOpp ? (
          <div className="bg-white rounded-xl border-2 border-dashed border-blue-200 p-10 text-center">
            <Bot size={40} className="text-blue-400 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800">
              Pronto para iniciar a negociação ao vivo
            </h3>
            <p className="text-sm text-slate-500 mt-1 max-w-xl mx-auto">
              O agente Claude Sonnet 4.6 vai abrir a conversa como comprador. Você digita como o
              vendedor PF neste ambiente de validação.
            </p>
            <button
              type="button"
              onClick={handleStartNegotiation}
              className="mt-5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold inline-flex items-center gap-2 shadow-md shadow-blue-200"
            >
              <Play size={14} /> Iniciar negociação ao vivo
            </button>
            <p className="text-xs text-slate-400 mt-3 flex items-center justify-center gap-1">
              <Sparkles size={11} /> Target 25% abaixo da FIPE · walk-away 10% abaixo · até 6
              rodadas
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            {/* Main: chat or summary */}
            <section className="flex h-[calc(100vh-22rem)] min-h-[480px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
              {status === "ended" ? (
                <SummaryPanel />
              ) : (
                <ChatView onKillSwitch={() => setKillSwitchTripped(true)} />
              )}
            </section>

            {/* Side: context (stacks below on narrow viewports via grid) */}
            <aside className="lg:sticky lg:top-6 lg:self-start">
              <ContextPanel />
            </aside>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Header ─────────────────────────────────────────────────────

interface BackstageHeaderProps {
  title: string;
  subtitle: React.ReactNode;
  onBack: () => void;
  onClose: (() => void) | null;
}

function BackstageHeader({
  title,
  subtitle,
  onBack,
  onClose,
}: BackstageHeaderProps): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200/70 pb-5">
      <div className="space-y-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 transition-colors hover:text-[#4C46DC]"
        >
          <ArrowLeft size={12} /> Voltar ao Marketplace
        </button>
        <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[#4C46DC]">
          <Bot size={12} />
          Backstage · sessão ao vivo
        </div>
        <h2
          className="text-3xl font-semibold leading-[1.05] tracking-tight text-slate-900 md:text-4xl"
          style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
        >
          {title}
        </h2>
        {subtitle ? <div>{subtitle}</div> : null}
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-red-300 hover:text-red-600"
        >
          <X size={14} /> Encerrar e voltar
        </button>
      ) : null}
    </div>
  );
}
