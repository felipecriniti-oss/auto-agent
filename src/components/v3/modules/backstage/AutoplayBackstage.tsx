"use client";

import { startNegotiation } from "@/components/negotiation/useNegotiationStream";
import Badge from "@/components/v3/ui/Badge";
import type { Opportunity } from "@/lib/mock-data/v3";
import type { PfPersona } from "@/lib/prompts/pf-sim-v1";
import { Bot, Pause, Play, RotateCcw, Sparkles, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type AutoplayOutcome,
  PERSONA_LABELS,
  detectAgentOutcome,
  detectPfOutcome,
  pickPersonaFromOpportunity,
  stripArgTags,
} from "./autoplay-helpers";
import {
  buildListingFromOpportunity,
  parseCityFromLocation,
  parseDiasOnline,
  parseReducoes,
} from "./helpers";

interface Props {
  opp: Opportunity;
}

type LoopRole = "agent" | "pf";

interface LoopMessage {
  id: string;
  role: LoopRole;
  content: string;
  isStreaming?: boolean;
}

type Status = "idle" | "running" | "paused" | "ended";

const MAX_ROUNDS = 6;

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toAgentSideMessages(
  messages: LoopMessage[],
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages.map((m) => ({
    role: m.role === "agent" ? ("assistant" as const) : ("user" as const),
    content: stripArgTags(m.content),
  }));
}

export default function AutoplayBackstage({ opp }: Props): React.JSX.Element {
  const persona: PfPersona = useMemo(() => pickPersonaFromOpportunity(opp), [opp]);
  const listing = useMemo(() => buildListingFromOpportunity(opp), [opp]);
  const targetPrice = useMemo(() => Math.round(opp.fipe * 0.75), [opp.fipe]);
  const walkAwayPrice = useMemo(() => Math.round(opp.fipe * 0.9), [opp.fipe]);

  const pfListing = useMemo(
    () => ({
      sellerName: opp.sellerName,
      vehicle: opp.vehicle,
      year: opp.year,
      km: opp.km,
      precoPedido: opp.dealPrice,
      fipe: opp.fipe,
      cidade: parseCityFromLocation(opp.location),
      diasOnline: parseDiasOnline(opp.motivationSignals),
      reducoes: parseReducoes(opp.motivationSignals),
    }),
    [opp],
  );

  const [messages, setMessages] = useState<LoopMessage[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [round, setRound] = useState(0);
  const [outcome, setOutcome] = useState<AutoplayOutcome>("in_progress");

  const statusRef = useRef<Status>("idle");
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<LoopMessage[]>([]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesLen = messages.length;
  const lastMessageLen = messages[messages.length - 1]?.content.length ?? 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps exist only to re-run autoscroll on new content; the effect body itself reads only scrollRef.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messagesLen, lastMessageLen]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const appendAgentChunk = useCallback((chunk: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "agent" && last.isStreaming) {
        const updated: LoopMessage = { ...last, content: last.content + chunk };
        return [...prev.slice(0, -1), updated];
      }
      const fresh: LoopMessage = {
        id: makeId(),
        role: "agent",
        content: chunk,
        isStreaming: true,
      };
      return [...prev, fresh];
    });
  }, []);

  const finalizeAgentMessage = useCallback((): string => {
    let finalText = "";
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || !last.isStreaming || last.role !== "agent") return prev;
      finalText = last.content;
      const finalized: LoopMessage = { ...last, isStreaming: false };
      return [...prev.slice(0, -1), finalized];
    });
    return finalText;
  }, []);

  const appendPfMessage = useCallback((content: string) => {
    setMessages((prev) => [...prev, { id: makeId(), role: "pf", content }]);
  }, []);

  const runAgentTurn = useCallback(async (): Promise<string> => {
    const apiMessages = toAgentSideMessages(messagesRef.current);
    const ctl = new AbortController();
    abortRef.current = ctl;

    return new Promise((resolve, reject) => {
      let accumulated = "";
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        reject(new Error("agent_aborted"));
      };
      ctl.signal.addEventListener("abort", onAbort);

      startNegotiation(
        {
          listing,
          fipe: opp.fipe,
          targetPrice,
          walkAwayPrice,
          maxRounds: MAX_ROUNDS,
          messages: apiMessages,
        },
        {
          onChunk: (text) => {
            accumulated += text;
            appendAgentChunk(text);
          },
          onDone: () => {
            if (settled) return;
            settled = true;
            ctl.signal.removeEventListener("abort", onAbort);
            const finalText = finalizeAgentMessage() || accumulated;
            resolve(finalText);
          },
          onError: (code) => {
            if (settled) return;
            settled = true;
            ctl.signal.removeEventListener("abort", onAbort);
            reject(new Error(`agent_${code}`));
          },
        },
        ctl.signal,
      );
    });
  }, [listing, opp.fipe, targetPrice, walkAwayPrice, appendAgentChunk, finalizeAgentMessage]);

  const runPfTurn = useCallback(async (): Promise<string> => {
    const apiMessages = toAgentSideMessages(messagesRef.current);
    const ctl = new AbortController();
    abortRef.current = ctl;

    const response = await fetch("/api/simulate-pf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        persona,
        listing: pfListing,
        messages: apiMessages,
      }),
      signal: ctl.signal,
    });

    if (!response.ok) {
      throw new Error(`pf_http_${response.status}`);
    }
    const data = (await response.json()) as { message?: string; error?: string };
    if (!data.message) {
      throw new Error(`pf_${data.error ?? "empty"}`);
    }
    return data.message;
  }, [persona, pfListing]);

  const runLoop = useCallback(async (): Promise<void> => {
    let currentRound = round;
    try {
      // If this is the very first tick (empty log), agent opens.
      while (statusRef.current === "running" && currentRound < MAX_ROUNDS) {
        const agentText = await runAgentTurn();
        if (statusRef.current !== "running") return;

        const agentOutcome = detectAgentOutcome(agentText);
        if (agentOutcome !== "in_progress") {
          setOutcome(agentOutcome);
          setStatus("ended");
          return;
        }

        const pfText = await runPfTurn();
        if (statusRef.current !== "running") return;
        appendPfMessage(pfText);

        const pfOutcome = detectPfOutcome(pfText);
        if (pfOutcome !== "in_progress") {
          setOutcome(pfOutcome);
          setStatus("ended");
          return;
        }

        currentRound += 1;
        setRound(currentRound);
      }

      if (statusRef.current === "running" && currentRound >= MAX_ROUNDS) {
        setOutcome("max_rounds");
        setStatus("ended");
      }
    } catch (err) {
      const e = err as Error;
      const msg = e?.message ?? "unknown";
      const name = e?.name ?? "";
      const isAbort =
        statusRef.current === "paused" ||
        name === "AbortError" ||
        msg.includes("aborted") ||
        msg.includes("agent_aborted");
      if (isAbort) return;
      console.warn("Autoplay loop error:", err);
      toast.error("Negociação autoplay interrompida", {
        description: `Falha: ${msg}. Pode retomar ou reiniciar.`,
      });
      setStatus("paused");
    }
  }, [round, runAgentTurn, runPfTurn, appendPfMessage]);

  const handleStart = useCallback(() => {
    if (status === "running") return;
    setStatus("running");
    setOutcome("in_progress");
    // kick loop on next tick so state settles
    queueMicrotask(() => {
      void runLoop();
    });
  }, [status, runLoop]);

  const handlePause = useCallback(() => {
    setStatus("paused");
    abortRef.current?.abort();
  }, []);

  const handleRestart = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setRound(0);
    setOutcome("in_progress");
    setStatus("idle");
  }, []);

  const canStart = status === "idle" || status === "paused";
  const running = status === "running";
  const ended = status === "ended";

  const personaLabel = PERSONA_LABELS[persona];

  return (
    <div className="overflow-hidden rounded-xl border-2 border-[#4C46DC]/30 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-200 bg-gradient-to-r from-[#4C46DC]/5 via-[#4C46DC]/10 to-transparent px-5 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[#4C46DC]" />
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4C46DC]">
              Autoplay · Agente vs vendedor simulado
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="accent" size="xs">
              Vendedor {personaLabel}
            </Badge>
            <Badge variant={ended ? "success" : running ? "warning" : "default"} size="xs">
              {ended
                ? outcomeLabel(outcome, round)
                : running
                  ? `Round ${round + 1}/${MAX_ROUNDS}`
                  : `Pronto · ${round}/${MAX_ROUNDS}`}
            </Badge>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="max-h-[52vh] min-h-[320px] space-y-3 overflow-y-auto bg-slate-50/60 p-5"
      >
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center">
            <Bot size={40} className="text-[#4C46DC]/60 mb-2" />
            <p className="text-sm font-semibold text-slate-700">
              Autoplay pronto — {personaLabel.toLowerCase()} do outro lado
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              O agente abre, o vendedor simulado responde, a conversa roda até fechar ou estourar{" "}
              {MAX_ROUNDS} rodadas. Você só assiste.
            </p>
          </div>
        ) : (
          messages.map((m) => <AutoplayBubble key={m.id} message={m} />)
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 flex-wrap">
        <div className="text-[11px] text-slate-500">
          Alvo R$ {targetPrice.toLocaleString("pt-BR")} · Walk-away R${" "}
          {walkAwayPrice.toLocaleString("pt-BR")} · FIPE R$ {opp.fipe.toLocaleString("pt-BR")}
        </div>
        <div className="flex items-center gap-2">
          {ended ? (
            <button
              type="button"
              onClick={handleRestart}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#4C46DC] hover:text-[#4C46DC]"
            >
              <RotateCcw size={12} /> Rodar de novo
            </button>
          ) : running ? (
            <button
              type="button"
              onClick={handlePause}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
            >
              <Pause size={12} /> Pausar
            </button>
          ) : canStart ? (
            <button
              type="button"
              onClick={handleStart}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#4C46DC] px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#3f39bf]"
            >
              <Play size={12} /> {status === "paused" ? "Retomar" : "Iniciar autoplay"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function outcomeLabel(outcome: AutoplayOutcome, round: number): string {
  switch (outcome) {
    case "deal_closed":
      return `Fechado · round ${round + 1}`;
    case "walkaway":
      return `Walk-away · round ${round + 1}`;
    case "max_rounds":
      return `Fim · ${MAX_ROUNDS} rodadas`;
    default:
      return "Encerrado";
  }
}

function AutoplayBubble({ message }: { message: LoopMessage }): React.JSX.Element {
  const isAgent = message.role === "agent";
  const text = stripArgTags(message.content);
  return (
    <div className={`flex gap-2.5 ${isAgent ? "justify-start" : "justify-end"}`}>
      {isAgent ? (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#4C46DC]/10 text-[#4C46DC]">
          <Bot size={16} />
        </div>
      ) : null}
      <div
        className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isAgent
            ? "bg-white text-slate-800 border border-slate-200"
            : "bg-amber-100 text-amber-900 border border-amber-200"
        }`}
      >
        <div className="mb-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-400">
          {isAgent ? "AutoAgente" : "Vendedor PF"}
        </div>
        <div className="whitespace-pre-wrap">
          {text}
          {message.isStreaming ? (
            <span className="ml-1 animate-pulse text-slate-400">▍</span>
          ) : null}
        </div>
      </div>
      {!isAgent ? (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-200/60 text-amber-800">
          <User size={16} />
        </div>
      ) : null}
    </div>
  );
}
