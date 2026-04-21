import type { Source } from "@/lib/mock-data/v3";

export interface SourceBadgeProps {
  source: Source | string;
}

const colors: Record<string, string> = {
  WebMotors: "bg-orange-50 text-orange-700 border-orange-200",
  "Mercado Livre": "bg-yellow-50 text-yellow-700 border-yellow-200",
  OLX: "bg-purple-50 text-purple-700 border-purple-200",
};

export default function SourceBadge({ source }: SourceBadgeProps) {
  const className = colors[source] ?? "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <span
      className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium border ${className}`}
    >
      {source}
    </span>
  );
}
