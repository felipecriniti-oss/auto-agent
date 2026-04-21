"use client";

import DealStatusBadge from "@/components/v3/ui/DealStatusBadge";
import ProgressBar from "@/components/v3/ui/ProgressBar";
import type { DealStatus, MyDeal } from "@/lib/mock-data/v3";
import { useAppStore } from "@/lib/stores/app";
import {
  CalendarClock,
  CheckCircle,
  Clock,
  FileCheck,
  FileSignature,
  FileText,
  type LucideIcon,
  Receipt,
  Smartphone,
  Truck,
} from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

export default function MyDealsModule(): React.JSX.Element {
  const myDeals = useAppStore((s) => s.myDeals);
  const setActiveModule = useAppStore((s) => s.setActiveModule);

  const counts = useMemo(() => {
    const c: Record<DealStatus, number> = {
      contrato_pendente: 0,
      laudo_agendado: 0,
      transferindo: 0,
      finalizado: 0,
    };
    for (const d of myDeals) c[d.status] += 1;
    return c;
  }, [myDeals]);

  return (
    <div className="space-y-6 p-6 md:p-8">
      {/* Editorial header */}
      <div className="flex flex-col gap-5 border-b border-slate-200/70 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[#4C46DC]">
            <FileCheck size={12} />
            Meus Deals · acompanhamento
          </div>
          <h1
            className="text-3xl font-semibold leading-[1.05] tracking-tight text-slate-900 md:text-4xl"
            style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
          >
            {myDeals.length} {myDeals.length === 1 ? "deal" : "deals"}{" "}
            <em className="italic text-[#4C46DC]">no seu pátio</em>.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-slate-600">
            Acompanhamento de contratos, laudos, transferências e pagamentos. Cada deal tem próxima
            ação clara — sem burocracia espalhada.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill
            label="Contrato pendente"
            count={counts.contrato_pendente}
            color="amber"
            Icon={FileSignature}
          />
          <StatusPill
            label="Laudo agendado"
            count={counts.laudo_agendado}
            color="blue"
            Icon={CalendarClock}
          />
          <StatusPill
            label="Transferindo"
            count={counts.transferindo}
            color="violet"
            Icon={Truck}
          />
          <StatusPill
            label="Finalizado"
            count={counts.finalizado}
            color="emerald"
            Icon={CheckCircle}
          />
        </div>
      </div>

      {/* Empty */}
      {myDeals.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <FileCheck size={36} className="text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700">
            Você ainda não assumiu nenhum deal
          </h3>
          <p className="text-sm text-slate-500 mt-1">Vá ao Marketplace para começar.</p>
          <button
            type="button"
            onClick={() => setActiveModule("marketplace")}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold"
          >
            Abrir Marketplace
          </button>
        </div>
      )}

      {/* Rows */}
      {myDeals.length > 0 && (
        <div className="space-y-3">
          {myDeals.map((deal) => (
            <DealRow key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── StatusPill ─────────────────────────────────────────────────

type PillColor = "amber" | "blue" | "violet" | "emerald";

interface StatusPillProps {
  label: string;
  count: number;
  color: PillColor;
  Icon: LucideIcon;
}

const pillColors: Record<PillColor, string> = {
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function StatusPill({ label, count, color, Icon }: StatusPillProps): React.JSX.Element {
  return (
    <div
      className={`px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 ${pillColors[color]}`}
    >
      <Icon size={12} />
      {label}: <span className="font-bold">{count}</span>
    </div>
  );
}

// ─── DealRow ────────────────────────────────────────────────────

interface DealRowProps {
  deal: MyDeal;
}

function DealRow({ deal }: DealRowProps): React.JSX.Element {
  const actions = getActionsForStatus(deal);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start gap-5">
        <div className="w-24 h-20 rounded-lg bg-slate-100 flex items-center justify-center text-3xl flex-shrink-0 border border-slate-200">
          {deal.img}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-900 truncate">{deal.vehicle}</h3>
              <p className="text-xs text-slate-500">Assumido {deal.assumedAt}</p>
            </div>
            <DealStatusBadge status={deal.status} />
          </div>

          {/* Finance grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2 text-sm">
            <div>
              <p className="text-xs text-slate-500">Preço</p>
              <p className="font-semibold text-slate-800">
                R$ {(deal.dealPrice / 1000).toFixed(0)}k
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">FIPE</p>
              <p className="font-semibold text-slate-500 line-through">
                R$ {(deal.fipe / 1000).toFixed(0)}k
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Economia</p>
              <p className="font-semibold text-emerald-700">
                R$ {(deal.savings / 1000).toFixed(0)}k
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Fee pago</p>
              <p className="font-semibold text-blue-700">R$ {deal.fee.toLocaleString("pt-BR")}</p>
            </div>
          </div>

          {/* Progress */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-500">Progresso da transação</span>
              <span className="font-semibold text-slate-700">{deal.progress}%</span>
            </div>
            <ProgressBar percent={deal.progress} color={deal.progress === 100 ? "green" : "blue"} />
            <p className="text-xs text-slate-600 mt-2 flex items-center gap-1.5">
              {deal.status === "finalizado" ? (
                <CheckCircle size={12} className="text-emerald-600" />
              ) : (
                <Clock size={12} className="text-amber-600" />
              )}
              <span>
                <strong>Próximo passo:</strong> {deal.nextStep}
              </span>
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Smartphone size={13} className="text-slate-400" />
              <span className="font-medium">{deal.sellerContact}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.onClick}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 ${
                    a.primary
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-white border border-slate-200 text-slate-700 hover:border-blue-300"
                  }`}
                >
                  <a.Icon size={12} /> {a.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  toast.info("Abrir WhatsApp vendedor", {
                    description: `Link simulado para ${deal.sellerContact}`,
                  })
                }
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:border-emerald-300"
                aria-label="WhatsApp vendedor"
              >
                <Smartphone size={13} className="text-emerald-600" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Status-driven actions ──────────────────────────────────────

interface DealAction {
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
  primary?: boolean;
}

function getActionsForStatus(deal: MyDeal): DealAction[] {
  switch (deal.status) {
    case "contrato_pendente":
      return [
        {
          label: "Abrir contrato",
          Icon: FileSignature,
          primary: true,
          onClick: () =>
            toast.success("Contrato mock baixado", {
              description: `Contrato de compra/venda — ${deal.vehicle}`,
            }),
        },
      ];
    case "laudo_agendado":
      return [
        {
          label: "Ver agendamento",
          Icon: CalendarClock,
          primary: true,
          onClick: () =>
            toast.info("Laudo agendado", {
              description: deal.nextStep,
            }),
        },
      ];
    case "transferindo":
      return [
        {
          label: "Status DETRAN",
          Icon: Truck,
          primary: true,
          onClick: () =>
            toast.info("Status DETRAN", {
              description: deal.nextStep,
            }),
        },
      ];
    case "finalizado":
      return [
        {
          label: "Ver documentação",
          Icon: FileText,
          primary: true,
          onClick: () =>
            toast.success("Documentação da venda", {
              description: `NF-e + transferência concluída para ${deal.vehicle}`,
            }),
        },
        {
          label: "Baixar NF-e",
          Icon: Receipt,
          onClick: () =>
            toast.success("NF-e baixada", {
              description: `NF-e emitida para ${deal.vehicle}`,
            }),
        },
      ];
    default:
      return [];
  }
}
