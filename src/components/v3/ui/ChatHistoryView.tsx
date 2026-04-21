import type { ChatTurn } from "@/lib/mock-data/v3";
import { Bot, User } from "lucide-react";

export interface ChatHistoryViewProps {
  history: ChatTurn[];
  sellerName: string;
}

export default function ChatHistoryView({ history, sellerName }: ChatHistoryViewProps) {
  return (
    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
      {history.map((msg, i) => {
        const isAgent = msg.from === "agent";
        return (
          <div
            key={`${msg.from}-${msg.round}-${i}`}
            className={`flex gap-3 ${isAgent ? "" : "flex-row-reverse"}`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                isAgent ? "bg-blue-100" : "bg-slate-200"
              }`}
            >
              {isAgent ? (
                <Bot size={16} className="text-blue-600" />
              ) : (
                <User size={16} className="text-slate-600" />
              )}
            </div>
            <div
              className={`${
                isAgent
                  ? "bg-blue-50 rounded-tl-none border-blue-100"
                  : "bg-white rounded-tr-none border-slate-200"
              } rounded-lg p-3 max-w-xl border`}
            >
              <div className="flex items-center justify-between mb-1">
                <p
                  className={`text-xs font-medium ${isAgent ? "text-blue-600" : "text-slate-500"}`}
                >
                  {isAgent ? `AutoAgente · Rodada ${msg.round}` : sellerName}
                </p>
                <span className="text-xs text-slate-400">{msg.time}</span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{msg.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
