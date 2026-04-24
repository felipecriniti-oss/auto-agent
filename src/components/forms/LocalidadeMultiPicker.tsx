"use client";

import { LocalidadePicker } from "@/components/forms/LocalidadePicker";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

type Props = {
  ufName?: string;
  citiesName?: string;
  disabled?: boolean;
};

/**
 * Multi-select wrapper for UF + cidade tuples.
 *
 * - Composes existing `LocalidadePicker` (D-12, canonical_refs line 102 — no fork).
 * - Maintains two parallel RHF field arrays: region_uf[] + region_cities[].
 * - Index N in each array is the paired tuple (region_uf[N], region_cities[N]).
 * - Deduplicates — re-adding an existing tuple is a no-op.
 * - Emits "Nenhuma região — aceita qualquer" empty-state copy from UI-SPEC State Matrix.
 */
export function LocalidadeMultiPicker({
  ufName = "region_uf",
  citiesName = "region_cities",
  disabled,
}: Props): React.JSX.Element {
  const { control, getValues } = useFormContext();
  const ufFieldArray = useFieldArray({ control, name: ufName });
  const cityFieldArray = useFieldArray({ control, name: citiesName });
  const [draftUf, setDraftUf] = useState("");
  const [draftCidade, setDraftCidade] = useState("");

  // For primitive string arrays, field.id is the internal RHF key;
  // the actual string value lives in the form values. Re-read via getValues
  // so the chip labels always reflect the current tuples.
  const ufFields = ufFieldArray.fields as Array<{ id: string }>;
  const currentUfs = (getValues(ufName) as string[] | undefined) ?? [];
  const currentCities = (getValues(citiesName) as string[] | undefined) ?? [];

  function handleAdd() {
    if (!draftUf || !draftCidade) return;
    // Dedup: refuse to append an existing tuple.
    const dupIndex = currentUfs.findIndex(
      (u, i) => u === draftUf && currentCities[i] === draftCidade,
    );
    if (dupIndex >= 0) return;
    ufFieldArray.append(draftUf);
    cityFieldArray.append(draftCidade);
    setDraftUf("");
    setDraftCidade("");
  }

  function handleRemove(i: number) {
    ufFieldArray.remove(i);
    cityFieldArray.remove(i);
  }

  const isEmpty = ufFields.length === 0;
  const canAdd = !!draftUf && !!draftCidade && !disabled;

  return (
    <div className="space-y-3">
      {isEmpty ? (
        <p className="text-slate-500 text-xs dark:text-slate-400">
          Nenhuma região — aceita qualquer
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {ufFields.map((field, i) => {
            const uf = currentUfs[i] ?? "";
            const cidade = currentCities[i] ?? "";
            const label = `${cidade}/${uf}`;
            return (
              <span
                key={field.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700 text-xs ring-1 ring-slate-200 ring-inset dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
              >
                {label}
                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  aria-label={`Remover ${label}`}
                  className="rounded-full p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
                  disabled={disabled}
                >
                  <X className="size-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <LocalidadePicker
            uf={draftUf}
            cidade={draftCidade}
            onUfChange={setDraftUf}
            onCidadeChange={setDraftCidade}
            disabled={disabled}
          />
        </div>
        <Button type="button" onClick={handleAdd} disabled={!canAdd} className="h-11">
          Adicionar
        </Button>
      </div>
    </div>
  );
}
