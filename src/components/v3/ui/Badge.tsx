import type { ReactNode } from "react";

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "primary"
  | "accent"
  | "success_strong";

export type BadgeSize = "xs" | "sm" | "md";

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

const styles: Record<BadgeVariant, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border border-amber-200",
  danger: "bg-red-50 text-red-700 border border-red-200",
  primary: "bg-blue-50 text-blue-700 border border-blue-200",
  accent: "bg-violet-50 text-violet-700 border border-violet-200",
  success_strong: "bg-emerald-600 text-white",
};

const sizes: Record<BadgeSize, string> = {
  xs: "text-xs px-1.5 py-0.5",
  sm: "text-xs px-2 py-1",
  md: "text-sm px-3 py-1",
};

export default function Badge({
  children,
  variant = "default",
  size = "sm",
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${styles[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </span>
  );
}
