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
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Model = { codigo: string; nome: string };

/**
 * Normalize for accent-insensitive search — same helper as FipeBrandCombobox
 * and LocalidadePicker. Lower + NFD decompose + strip combining marks.
 */
function norm(s: string): string {
  return s
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

type Props = {
  brand: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  id?: string;
};

/**
 * Model combobox. Lazy-fetches models via React Query against
 * `GET /api/fipe?type=models&brand=X` with a 5s hard timeout on top of
 * React Query's own abort signal. On 5xx or timeout, silently falls back
 * to a free-text <Input> and fires a sonner info toast (D-05).
 *
 * React Query config locked by D-04:
 *  - staleTime: Infinity (brand key caches forever in-session)
 *  - retry: false (fail fast → fallback)
 *  - gcTime: 30min (survive short brand-toggle detours)
 */
export function FipeModelCombobox({
  brand,
  value,
  onChange,
  disabled,
  id,
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [fallbackToText, setFallbackToText] = useState(false);

  const enabled = !!brand && !fallbackToText;

  const { data, isError, isLoading } = useQuery({
    queryKey: ["fipe", "models", brand],
    queryFn: async ({ signal: rqSignal }) => {
      const ctrl = new AbortController();
      const onRqAbort = () => ctrl.abort();
      rqSignal.addEventListener("abort", onRqAbort);
      const t = setTimeout(() => ctrl.abort(), 5000);
      try {
        const res = await fetch(`/api/fipe?type=models&brand=${encodeURIComponent(brand)}`, {
          signal: ctrl.signal,
        });
        if (res.status >= 500 || !res.ok) {
          throw new Error("fipe_upstream");
        }
        return (await res.json()) as { models: Model[] };
      } finally {
        clearTimeout(t);
        rqSignal.removeEventListener("abort", onRqAbort);
      }
    },
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    gcTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (isError) {
      toast.info("FIPE indisponível — digite manualmente");
      setFallbackToText(true);
    }
  }, [isError]);

  // Reset fallback when brand changes — user may retry with a different brand
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — watch brand only
  useEffect(() => {
    setFallbackToText(false);
  }, [brand]);

  if (fallbackToText) {
    return (
      <Input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Digite o modelo"
        disabled={disabled}
        className="h-11 bg-white dark:bg-slate-950"
      />
    );
  }

  const triggerDisabled = disabled || !brand;
  const placeholder = brand ? "Selecione o modelo" : "Selecione a marca primeiro";
  const models = data?.models ?? [];

  return (
    <Popover open={open} onOpenChange={(next) => !triggerDisabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA 1.2 combobox pattern — trigger MUST carry role="combobox" (not <select>, which breaks Popover+Command keyboard nav)
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={triggerDisabled}
          className="h-11 w-full justify-between bg-white font-normal disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950"
        >
          <span className={cn(!value && "text-slate-400")}>{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command filter={(v, q) => (norm(v).includes(norm(q)) ? 1 : 0)}>
          <CommandInput placeholder="Digite pra filtrar..." className="h-10" />
          <CommandList>
            {isLoading ? (
              <CommandEmpty>Carregando modelos...</CommandEmpty>
            ) : (
              <CommandEmpty>Nenhum modelo encontrado</CommandEmpty>
            )}
            <CommandGroup>
              {models.map((m) => (
                <CommandItem
                  key={m.codigo}
                  value={m.nome}
                  onSelect={(v) => {
                    onChange(v);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === m.nome ? "opacity-100" : "opacity-0")}
                  />
                  {m.nome}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
