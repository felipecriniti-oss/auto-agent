import type { DealStatus } from "@/lib/mock-data/v3";
import { CheckCircle, FileSignature, type LucideIcon, RefreshCw, ShieldCheck } from "lucide-react";
import Badge, { type BadgeVariant } from "./Badge";

export interface DealStatusBadgeProps {
  status: DealStatus;
}

const map: Record<DealStatus, { label: string; variant: BadgeVariant; icon: LucideIcon }> = {
  contrato_pendente: { label: "Contrato pendente", variant: "warning", icon: FileSignature },
  laudo_agendado: { label: "Laudo agendado", variant: "primary", icon: ShieldCheck },
  transferindo: { label: "Transferência DETRAN", variant: "accent", icon: RefreshCw },
  finalizado: { label: "Finalizado", variant: "success", icon: CheckCircle },
};

export default function DealStatusBadge({ status }: DealStatusBadgeProps) {
  const s = map[status] ?? map.contrato_pendente;
  const Icon = s.icon;
  return (
    <Badge variant={s.variant} size="sm">
      <Icon size={12} className="mr-1" />
      {s.label}
    </Badge>
  );
}
