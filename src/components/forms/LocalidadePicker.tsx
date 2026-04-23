"use client";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UFS, cidadesDoUf } from "@/lib/brasil/localidades";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { useId, useMemo, useState } from "react";

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

/**
 * Normalize for accent-insensitive search — "São Paulo" matches "sao paulo",
 * "Poá" matches "poa" etc. Lower + NFD decompose + strip combining marks.
 */
function norm(s: string): string {
  // Strip Unicode combining diacritical marks (U+0300–U+036F) after NFD decompose.
  return s
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

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
  const [open, setOpen] = useState(false);

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
        <Label className={labelClass}>{labelCidade}</Label>
        <Popover open={open} onOpenChange={(next) => !cidadeDisabled && setOpen(next)}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              aria-expanded={open}
              aria-haspopup="listbox"
              disabled={cidadeDisabled}
              className="mt-1.5 h-11 w-full justify-between bg-white font-normal disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950"
            >
              <span className={cn(!cidade && "text-slate-400")}>
                {cidade || (uf ? "Selecione ou digite a cidade" : "Selecione a UF primeiro")}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command filter={(value, search) => (norm(value).includes(norm(search)) ? 1 : 0)}>
              <CommandInput placeholder="Digite pra filtrar..." className="h-10" />
              <CommandList>
                <CommandEmpty>Nenhuma cidade encontrada.</CommandEmpty>
                <CommandGroup>
                  {cidades.map((c) => (
                    <CommandItem
                      key={c}
                      value={c}
                      onSelect={(v) => {
                        onCidadeChange(v);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn("mr-2 h-4 w-4", cidade === c ? "opacity-100" : "opacity-0")}
                      />
                      {c}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {required ? (
          <input
            type="text"
            value={cidade}
            onChange={() => {
              /* controlled by combobox */
            }}
            required
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute h-0 w-0 opacity-0"
          />
        ) : null}
      </div>
    </div>
  );
}
