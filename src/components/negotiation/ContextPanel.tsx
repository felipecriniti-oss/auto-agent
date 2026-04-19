"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { renderMessageContent, useNegotiationStore } from "@/lib/stores/negotiation";

export function ContextPanel() {
  // Single primitive slice → split selector (Pattern A from <guidance>).
  const s = useNegotiationStore((st) => st.currentSession);
  if (!s) {
    return (
      <div className="sticky top-4 text-sm text-slate-500">Preencha o anúncio para iniciar.</div>
    );
  }

  // Current offer: last agent message content (strip tags), look for first "R$ N" — best-effort.
  const lastAgent = [...s.messages].reverse().find((m) => m.role === "agent" && !m.isStreaming);
  const lastText = lastAgent ? renderMessageContent(lastAgent.content) : "";
  const priceMatch = lastText.match(/R\$\s*([\d.]+(?:,\d+)?)/);
  const currentOffer = priceMatch ? priceMatch[0] : "—";

  return (
    <div className="sticky top-4 space-y-3">
      <Card className="border-violet-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wide text-violet-700">
            Última oferta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-violet-700">{currentOffer}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wide text-slate-600">Anúncio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>
            <span className="font-medium">
              {s.listing.marca} {s.listing.modelo} {s.listing.ano}
            </span>
          </div>
          <div className="text-slate-600">{s.listing.km.toLocaleString("pt-BR")} km</div>
          <div className="text-slate-600">{s.listing.cidade}</div>
          <div className="text-slate-600">
            {s.listing.diasOnline} dias online • {s.listing.reducoes} reduções
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
