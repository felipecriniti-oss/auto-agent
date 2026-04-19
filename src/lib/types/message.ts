export type Role = "agent" | "seller";

export interface Message {
  id: string;
  role: Role;
  round: number;
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  error?: boolean;
}
