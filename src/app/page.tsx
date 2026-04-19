"use client";

import { AdListingForm } from "@/components/negotiation/AdListingForm";
import { ChatView } from "@/components/negotiation/ChatView";
import { ContextPanel } from "@/components/negotiation/ContextPanel";
import { KillSwitchBanner } from "@/components/negotiation/KillSwitchBanner";
import { SummaryPanel } from "@/components/negotiation/SummaryPanel";
import { Toaster } from "@/components/ui/sonner";
import { useNegotiationStore } from "@/lib/stores/negotiation";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";

export default function NegotiationPage() {
  // 2 slices → useShallow (Pattern B). startNegotiating is an action (stable);
  // session changes drive the status-driven render.
  const { session, startNegotiating } = useNegotiationStore(
    useShallow((s) => ({
      session: s.currentSession,
      startNegotiating: s.startNegotiating,
    })),
  );
  const [killSwitchTripped, setKillSwitchTripped] = useState(false);

  const status = session?.status ?? "idle";

  return (
    <>
      <KillSwitchBanner visible={killSwitchTripped} />
      <Toaster richColors position="top-right" />
      <main className="mx-auto grid min-h-screen max-w-7xl grid-cols-[320px_1fr_320px] gap-6 p-6">
        {/* Left: form (D-01) */}
        <aside className="sticky top-6 h-fit">
          <AdListingForm
            disabled={status === "negotiating" || status === "ended" || killSwitchTripped}
            onReady={() => startNegotiating()}
          />
        </aside>

        {/* Center: chat or summary (D-01, D-15) */}
        <section className="flex h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
          {status === "ended" ? (
            <SummaryPanel />
          ) : status === "negotiating" ? (
            <ChatView onKillSwitch={() => setKillSwitchTripped(true)} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
              Preencha o anúncio à esquerda, aguarde o FIPE e clique em "Iniciar negociação".
            </div>
          )}
        </section>

        {/* Right: context (D-03) */}
        <aside>
          <ContextPanel />
        </aside>
      </main>
    </>
  );
}
