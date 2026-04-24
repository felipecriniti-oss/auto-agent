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
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import snapshot from "@/lib/brasil/fipe-brands-snapshot.json";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

type Brand = { codigo: string; nome: string };

/**
 * Normalize for accent-insensitive search — "chev" matches "Chevrolet",
 * "volks" matches "VW - VolksWagen". Lower + NFD decompose + strip combining marks.
 * Copy of `LocalidadePicker.norm()` — rule-of-three extraction deferred.
 */
function norm(s: string): string {
  return s
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

type Props = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  id?: string;
  /**
   * When true, render a free-text <Input> instead of the combobox.
   * Kept for D-05 symmetry with FipeModelCombobox (brand fallback is rare
   * because the snapshot is static, but the prop exists so a parent can
   * force free-text if the snapshot is empty or stale).
   */
  fallbackToText?: boolean;
};

/**
 * Brand combobox backed by the static fipe-brands-snapshot.json (D-03 instant paint).
 * Emits the canonical brand name (string) via onChange — never the codigo.
 */
export function FipeBrandCombobox({
  value,
  onChange,
  disabled,
  id,
  fallbackToText,
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const brands = (snapshot.brands as Brand[]) ?? [];

  if (fallbackToText) {
    return (
      <Input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Digite a marca"
        disabled={disabled}
        className="h-11 bg-white dark:bg-slate-950"
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA 1.2 combobox pattern — trigger MUST carry role="combobox" (not <select>, which breaks Popover+Command keyboard nav)
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          className="h-11 w-full justify-between bg-white font-normal disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950"
        >
          <span className={cn(!value && "text-slate-400")}>{value || "Selecione a marca"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command filter={(v, q) => (norm(v).includes(norm(q)) ? 1 : 0)}>
          <CommandInput placeholder="Digite pra filtrar..." className="h-10" />
          <CommandList>
            <CommandEmpty>Nenhuma marca encontrada</CommandEmpty>
            <CommandGroup>
              {brands.map((b) => (
                <CommandItem
                  key={b.codigo}
                  value={b.nome}
                  onSelect={(v) => {
                    onChange(v);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === b.nome ? "opacity-100" : "opacity-0")}
                  />
                  {b.nome}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
