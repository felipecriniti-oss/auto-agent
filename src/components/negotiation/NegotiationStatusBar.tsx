"use client";

import { Badge } from "@/components/ui/badge";
import { useNegotiationStore } from "@/lib/stores/negotiation";

/**
 * D-04: FIPE, targetPrice, walkAwayPrice, round — NOT in ContextPanel.
 * Thin status bar at the top of ChatView. Visible only during negotiating / ended.
 *
 * Uses a split selector (Pattern A from <guidance>) — a single primitive slice,
 * no useShallow needed because the returned object reference is stable between
 * store updates that don't change currentSession.
 */
export function NegotiationStatusBar() {
  const s = useNegotiationStore((st) => st.currentSession);
  if (!s) return null;
  const fmt = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;
  return (
    <div
      data-testid="negotiation-status-bar"
      className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-xs"
    >
      <Badge data-testid="status-fipe" variant="outline" className="border-slate-300 bg-slate-50">
        FIPE: {fmt(s.fipe)}
      </Badge>
      <Badge
        data-testid="status-target"
        variant="outline"
        className="border-emerald-300 bg-emerald-50 text-emerald-700"
      >
        Target: {fmt(s.targetPrice)}
      </Badge>
      <Badge
        data-testid="status-walkaway"
        variant="outline"
        className="border-amber-300 bg-amber-50 text-amber-700"
      >
        Walk-away: {fmt(s.walkAwayPrice)}
      </Badge>
      <Badge
        data-testid="status-round"
        variant="outline"
        className="ml-auto border-violet-300 bg-violet-50 text-violet-700"
      >
        Rodada {s.round}/{s.maxRounds}
      </Badge>
    </div>
  );
}
