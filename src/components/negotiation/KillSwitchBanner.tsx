"use client";

import { AlertCircle } from "lucide-react";

interface Props {
  visible: boolean;
}

export function KillSwitchBanner({ visible }: Props) {
  if (!visible) return null;
  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex items-center gap-2 bg-red-600 px-4 py-2 text-sm text-white"
    >
      <AlertCircle className="h-4 w-4" />
      Negociações temporariamente indisponíveis.
    </div>
  );
}
