"use client";

import { type PriorityModel, mockPriorityModels } from "@/lib/mock-data/v3";
import { Info, Radar as RadarIcon, Search, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type RecommendationFilter = "todos" | "priorizar" | "manter" | "reduzir" | "pausar";

const filters: { key: RecommendationFilter; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "priorizar", label: "Priorizar" },
  { key: "manter", label: "Manter" },
  { key: "reduzir", label: "Reduzir" },
  { key: "pausar", label: "Pausar" },
];

function matchesFilter(rec: string, filter: RecommendationFilter): boolean {
  if (filter === "todos") return true;
  return rec.toLowerCase().includes(filter);
}

const rowAccents: Record<string, string> = {
  emerald: "border-l-4 border-l-emerald-500 bg-emerald-50/40",
  blue: "border-l-4 border-l-blue-500 bg-blue-50/40",
  amber: "border-l-4 border-l-amber-500 bg-amber-50/40",
};

const recommendationPills: Record<string, string> = {
  emerald: "bg-emerald-100 text-emerald-800",
  blue: "bg-blue-100 text-blue-800",
  amber: "bg-amber-100 text-amber-800",
};

function RadarRow({ item }: { item: PriorityModel }): React.JSX.Element {
  const accent = rowAccents[item.cor] ?? "";
  const pill = recommendationPills[item.cor] ?? "bg-slate-100 text-slate-700";
  return (
    <tr className={accent}>
      <td className="px-4 py-3 text-sm font-semibold text-slate-900">{item.model}</td>
      <td className="px-4 py-3 text-sm text-emerald-700 font-semibold">
        R$ {item.margemMediaCapturada.toLocaleString("pt-BR")}
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">{item.demandaLojistas}</td>
      <td className="px-4 py-3 text-sm text-slate-700">{item.giroMedio} dias</td>
      <td className="px-4 py-3 text-sm text-slate-700">{item.inventarioAtivo}</td>
      <td className="px-4 py-3">
        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${pill}`}>
          {item.recomendacao}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={() =>
              toast.info(`Oportunidades · ${item.model}`, {
                description: "Abrindo lista filtrada no Marketplace (stub).",
              })
            }
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:border-blue-300 flex items-center gap-1"
          >
            <Search size={12} /> Ver oportunidades
          </button>
          <button
            type="button"
            onClick={() =>
              toast.success(`Captação priorizada · ${item.model}`, {
                description: "Modelo movido para fila de captação prioritária (stub).",
              })
            }
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
          >
            <Target size={12} /> Priorizar captação
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function RadarModule(): React.JSX.Element {
  const [filter, setFilter] = useState<RecommendationFilter>("todos");

  const filtered = useMemo<PriorityModel[]>(
    () => mockPriorityModels.filter((m) => matchesFilter(m.recomendacao, filter)),
    [filter],
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <RadarIcon size={22} className="text-blue-600" />
          Radar
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          O Radar mostra quais modelos priorizar captação baseado em demanda, giro e margem
          capturada nos últimos 90 dias.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Info size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <p className="font-semibold mb-1">Como usar:</p>
          <p>
            Use os filtros abaixo para ver modelos por recomendação estratégica. Verde = alta
            prioridade, azul = manter, amarelo = reduzir/pausar.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              filter === f.key
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-700 border-slate-200 hover:border-blue-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Modelo
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Margem média capturada
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Demanda lojistas
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Giro médio
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Inventário ativo
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Recomendação
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((m) => (
                <RadarRow key={m.model} item={m} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                    Nenhum modelo corresponde ao filtro "{filter}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
