"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { renderMessageContent, useNegotiationStore } from "@/lib/stores/negotiation";
import { Lightbulb } from "lucide-react";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ChatView } from "./ChatView";

function extractPriceFromMessage(content: string): number | null {
  const text = renderMessageContent(content);
  const m = text.match(/R\$\s*([\d.]+(?:,\d+)?)/g);
  if (!m) return null;
  // Take the LAST price in the message (typically the offer).
  const last = m[m.length - 1]
    .replace(/R\$\s*/, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number.parseFloat(last);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function computeSummaryPrices(messages: { role: string; content: string }[]): {
  initialOffer: number | null;
  finalOffer: number | null;
} {
  const agentMessages = messages.filter((m) => m.role === "agent");
  if (agentMessages.length === 0) return { initialOffer: null, finalOffer: null };
  const initialOffer = extractPriceFromMessage(agentMessages[0].content);
  const finalOffer = extractPriceFromMessage(agentMessages[agentMessages.length - 1].content);
  return { initialOffer, finalOffer };
}

function pctColor(pct: number): string {
  if (pct >= 20) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (pct >= 10) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-red-700 bg-red-50 border-red-200";
}

export function SummaryPanel() {
  const [showTranscript, setShowTranscript] = useState(false);
  // Split: primitive + action via useShallow; derived args computed separately.
  // Calling a method that allocates (`getArgumentsUsed`) inside the selector
  // returns a new array each run → useShallow never equals → infinite re-render
  // loop (React error #185). Compute derived data outside the selector via useMemo.
  const { session, newNegotiation } = useNegotiationStore(
    useShallow((st) => ({
      session: st.currentSession,
      newNegotiation: st.newNegotiation,
    })),
  );
  // Depend on `session` so recomputation happens on every messages mutation.
  // `getState()` is intentional — calling the derived method inside the selector
  // would return a fresh array on every evaluation and infinite-loop useShallow.
  // biome-ignore lint/correctness/useExhaustiveDependencies: session drives recompute even though the callback uses getState()
  const args = useMemo(() => useNegotiationStore.getState().getArgumentsUsed(), [session]);

  if (!session) return null;
  if (showTranscript) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <div className="text-sm font-medium">Transcrição (somente leitura)</div>
          <Button variant="outline" size="sm" onClick={() => setShowTranscript(false)}>
            Voltar ao resumo
          </Button>
        </div>
        <ChatView readonly />
      </div>
    );
  }

  const { initialOffer, finalOffer } = computeSummaryPrices(session.messages);
  const ask = session.listing.precoPedido;
  const fipe = session.fipe;
  const pctVsAsk = finalOffer && ask ? Math.round(((ask - finalOffer) / ask) * 100) : 0;
  const pctVsFipe = finalOffer && fipe ? Math.round(((fipe - finalOffer) / fipe) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <div className="text-sm font-medium">Resumo da negociação</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTranscript(true)}>
            Ver conversa completa
          </Button>
          <Button size="sm" onClick={() => newNegotiation()}>
            Nova negociação
          </Button>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* KPI grid — D-13 */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-slate-500">Rodadas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {session.round}/{session.maxRounds}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-slate-500">
                Preço inicial / final
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                <div>
                  Inicial: {initialOffer ? `R$ ${initialOffer.toLocaleString("pt-BR")}` : "—"}
                </div>
                <div className="font-bold">
                  Final: {finalOffer ? `R$ ${finalOffer.toLocaleString("pt-BR")}` : "—"}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={pctColor(pctVsAsk)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase">vs Preço pedido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pctVsAsk}%</div>
            </CardContent>
          </Card>
          <Card className={pctColor(pctVsFipe)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase">vs FIPE</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pctVsFipe}%</div>
            </CardContent>
          </Card>
        </div>

        {/* Arguments — D-14 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Argumentos usados</CardTitle>
          </CardHeader>
          <CardContent>
            {args.length === 0 ? (
              <div className="text-sm text-slate-500">Nenhum argumento capturado.</div>
            ) : (
              <ul className="space-y-2">
                {args.map((a, i) => (
                  <li key={`${i}-${a}`} className="flex items-start gap-2 text-sm">
                    <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
