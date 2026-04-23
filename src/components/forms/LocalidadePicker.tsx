"use client";

import { Label } from "@/components/ui/label";
import { UFS, cidadesDoUf } from "@/lib/brasil/localidades";
import { useId, useMemo } from "react";

interface LocalidadePickerProps {
  uf: string;
  cidade: string;
  onUfChange: (uf: string) => void;
  onCidadeChange: (cidade: string) => void;
  disabled?: boolean;
  required?: boolean;
  labelUf?: string;
  labelCidade?: string;
}

const selectClass =
  "mt-1.5 h-11 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

const labelClass =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400";

export function LocalidadePicker({
  uf,
  cidade,
  onUfChange,
  onCidadeChange,
  disabled,
  required,
  labelUf = "UF",
  labelCidade = "Cidade",
}: LocalidadePickerProps) {
  const ufId = useId();
  const cidadeId = useId();

  const cidades = useMemo(() => cidadesDoUf(uf), [uf]);
  const cidadeDisabled = disabled || !uf;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[120px_1fr]">
      <div>
        <Label htmlFor={ufId} className={labelClass}>
          {labelUf}
        </Label>
        <select
          id={ufId}
          value={uf}
          onChange={(e) => {
            const next = e.target.value;
            onUfChange(next);
            if (cidade && !cidadesDoUf(next).includes(cidade)) {
              onCidadeChange("");
            }
          }}
          disabled={disabled}
          required={required}
          className={selectClass}
        >
          <option value="" disabled>
            UF
          </option>
          {UFS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor={cidadeId} className={labelClass}>
          {labelCidade}
        </Label>
        <select
          id={cidadeId}
          value={cidade}
          onChange={(e) => onCidadeChange(e.target.value)}
          disabled={cidadeDisabled}
          required={required}
          className={selectClass}
        >
          <option value="" disabled>
            {uf ? "Selecione a cidade" : "Selecione a UF primeiro"}
          </option>
          {cidades.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
