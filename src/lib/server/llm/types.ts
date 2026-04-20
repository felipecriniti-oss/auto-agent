export type LLMProvider = "anthropic" | "gemini";

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamOptions {
  systemPrompt: string;
  messages: LLMMessage[];
  maxTokens: number;
  signal: AbortSignal;
  onText: (chunk: string) => void;
}
