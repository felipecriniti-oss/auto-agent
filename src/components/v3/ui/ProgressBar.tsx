export type ProgressBarColor = "blue" | "green" | "amber";

export interface ProgressBarProps {
  percent: number;
  color?: ProgressBarColor;
}

const colorMap: Record<ProgressBarColor, string> = {
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
};

export default function ProgressBar({ percent, color = "blue" }: ProgressBarProps) {
  return (
    <div className="w-full bg-slate-100 rounded-full h-2">
      <div
        className={`h-2 rounded-full ${colorMap[color]}`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}
