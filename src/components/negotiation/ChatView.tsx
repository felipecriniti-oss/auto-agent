"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useNegotiationStore } from "@/lib/stores/negotiation";
import { ArrowDown, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { MessageBubble } from "./MessageBubble";
import { NegotiationStatusBar } from "./NegotiationStatusBar";
import { TypingIndicator } from "./TypingIndicator";
import { useAutoscroll } from "./useAutoscroll";
import { startNegotiation } from "./useNegotiationStream";

interface Props {
  readonly?: boolean;
  onKillSwitch?: () => void;
}

type AgentRole = "user" | "assistant";

export function ChatView({ readonly, onKillSwitch }: Props) {
  // Single primitive slice → split selector (Pattern A from <guidance>).
  const session = useNegotiationStore((s) => s.currentSession);

  // 4 action slices → useShallow (Pattern B). Actions are stable references so
  // re-renders only happen when the store remaps them (effectively never).
  const { appendAgentChunk, finalizeAgentMessage, addSellerMessage, endSession } =
    useNegotiationStore(
      useShallow((s) => ({
        appendAgentChunk: s.appendAgentChunk,
        finalizeAgentMessage: s.finalizeAgentMessage,
        addSellerMessage: s.addSellerMessage,
        endSession: s.endSession,
      })),
    );

  const [sellerDraft, setSellerDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const {
    ref: scrollRef,
    isAtBottom,
    scrollToBottom,
  } = useAutoscroll<HTMLDivElement>([
    session?.messages.length,
    session?.messages[session.messages.length - 1]?.content,
  ]);

  // Cleanup abort on unmount (T-07-02)
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function sendToAgent(apiMessages: Array<{ role: AgentRole; content: string }>) {
    if (!session) return;
    const ctl = new AbortController();
    abortRef.current = ctl;
    setStreaming(true);
    await startNegotiation(
      {
        listing: session.listing,
        fipe: session.fipe,
        targetPrice: session.targetPrice,
        walkAwayPrice: session.walkAwayPrice,
        maxRounds: session.maxRounds,
        messages: apiMessages,
      },
      {
        onChunk: (text) => appendAgentChunk(text),
        onDone: () => {
          finalizeAgentMessage();
          setStreaming(false);
        },
        onError: (code) => {
          setStreaming(false);
          if (code === "disabled") onKillSwitch?.();
          else if (code === "rate_limited")
            toast.error("Muitas negociações recentes. Tente novamente em breve.");
          else toast.error("Erro na negociação. Tente novamente.");
        },
      },
      ctl.signal,
    );
  }

  // On first mount in 'negotiating' status without opener yet — request opener.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fire once on status transition to negotiating
  useEffect(() => {
    if (!session || readonly) return;
    if (session.status === "negotiating" && session.messages.length === 0 && !streaming) {
      sendToAgent([{ role: "user", content: "Início da conversa." }]);
    }
  }, [session?.status]);

  function handleSend() {
    if (!session || !sellerDraft.trim()) return;
    const draft = sellerDraft.trim().slice(0, 2000);
    setSellerDraft("");
    addSellerMessage(draft);
    const history = useNegotiationStore.getState().currentSession?.messages ?? [];
    const apiMessages = history.map((m) => ({
      role: (m.role === "agent" ? "assistant" : "user") as AgentRole,
      content: m.content,
    }));
    sendToAgent(apiMessages);
  }

  function handleEncerrar() {
    abortRef.current?.abort();
    endSession("user_stopped");
  }

  const waitingOpener =
    session?.status === "negotiating" &&
    streaming &&
    !session.messages.some((m) => m.role === "agent" && m.isStreaming);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <div className="text-sm font-medium">Negociação</div>
        {!readonly ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="outline" size="sm" className="bg-red-50 text-red-700">
                  <XCircle className="mr-1 h-4 w-4" />
                  Encerrar
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Encerrar agora?</AlertDialogTitle>
                <AlertDialogDescription>
                  O resumo será gerado com as rodadas já completas. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleEncerrar}>Encerrar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>

      <NegotiationStatusBar />

      <div ref={scrollRef} className="relative flex-1 overflow-y-auto p-4">
        {session?.messages.map((m) => <MessageBubble key={m.id} message={m} />) ?? null}
        {waitingOpener ? <TypingIndicator /> : null}
        {!isAtBottom ? (
          <Button
            size="sm"
            onClick={scrollToBottom}
            className="sticky bottom-4 left-1/2 -translate-x-1/2"
          >
            <ArrowDown className="mr-1 h-4 w-4" />
            Nova mensagem
          </Button>
        ) : null}
      </div>

      {!readonly ? (
        <div className="border-t border-slate-200 p-3">
          <div className="flex gap-2">
            <textarea
              value={sellerDraft}
              onChange={(e) => setSellerDraft(e.target.value.slice(0, 2000))}
              placeholder="Resposta do vendedor..."
              rows={2}
              maxLength={2000}
              disabled={streaming}
              className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <Button onClick={handleSend} disabled={streaming || !sellerDraft.trim()}>
              Enviar
            </Button>
          </div>
          <div className="mt-1 text-xs text-slate-400">{sellerDraft.length}/2000</div>
        </div>
      ) : null}
    </div>
  );
}
