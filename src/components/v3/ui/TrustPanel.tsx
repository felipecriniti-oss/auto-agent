import {
  FileSignature,
  Headphones,
  type LucideIcon,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";

export interface TrustPanelProps {
  inline?: boolean;
}

interface TrustItem {
  icon: LucideIcon;
  title: string;
  body: string;
}

const TRUST_ITEMS: TrustItem[] = [
  {
    icon: Wallet,
    title: "Escrow garantido",
    body: "Seu pagamento ao vendedor fica retido na AutoAgent (Asaas regulado pelo BCB) e só é liberado após confirmação de transferência DETRAN.",
  },
  {
    icon: RefreshCw,
    title: "Reembolso integral do fee",
    body: "Se o vendedor desistir durante os 7 dias de exclusividade, devolvemos 100% do fee em até 24h via PIX.",
  },
  {
    icon: FileSignature,
    title: "Contrato de exclusividade assinado",
    body: "O vendedor já assinou compromisso digital de não negociar com terceiros pelos 7 dias. Multa contratual em caso de quebra.",
  },
  {
    icon: ShieldCheck,
    title: "Due diligence obrigatória",
    body: "Já consultamos sinistro, leilão, gravame, restrição judicial e hodômetro. Garantia adicional: se houver problema oculto descoberto pós-venda, reembolsamos o fee.",
  },
  {
    icon: Headphones,
    title: "Suporte humano dedicado",
    body: "Ops da AutoAgent acompanha a transação até a transferência. Disputas são resolvidas em até 48h.",
  },
];

export default function TrustPanel({ inline = false }: TrustPanelProps) {
  return (
    <div className={inline ? "" : "bg-emerald-50 rounded-xl border-2 border-emerald-200 p-4"}>
      {!inline && (
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={18} className="text-emerald-600" />
          <h4 className="text-sm font-bold text-emerald-900">
            Garantias AutoAgent — o que protege seu fee
          </h4>
        </div>
      )}
      <div className="space-y-2.5">
        {TRUST_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon size={12} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800">{item.title}</p>
                <p className="text-xs text-slate-600">{item.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
