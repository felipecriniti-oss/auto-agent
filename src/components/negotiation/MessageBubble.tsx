"use client";

import { renderMessageContent } from "@/lib/stores/negotiation";
import type { Message } from "@/lib/types/message";
import { AlertCircle } from "lucide-react";

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  const isAgent = message.role === "agent";
  const text = renderMessageContent(message.content); // D-14 tag strip
  return (
    <div className={`mb-2 flex ${isAgent ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[75%] px-3 py-2 text-sm leading-relaxed ${
          isAgent
            ? "rounded-t-lg rounded-br-lg rounded-bl-sm bg-slate-100 text-slate-900"
            : "rounded-t-lg rounded-bl-lg rounded-br-sm bg-emerald-500 text-white"
        }`}
        data-testid="message-bubble"
        data-role={message.role}
      >
        <span className="whitespace-pre-wrap">{text}</span>
        {message.isStreaming ? <span className="animate-pulse">▌</span> : null}
        {message.error ? (
          <span className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <AlertCircle className="h-3 w-3" />
            Falha ao completar resposta — clique para tentar novamente
          </span>
        ) : null}
      </div>
    </div>
  );
}
