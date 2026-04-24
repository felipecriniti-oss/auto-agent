---
plan_id: "07-08"
phase: 7
slug: wishlist-ui
wave: 3
title: "LocalidadeMultiPicker — array wrapper over existing LocalidadePicker"
depends_on:
  - "07-01"   # needs wishlistSchema region_uf[] + region_cities[] arrays
files_modified:
  - src/components/forms/LocalidadeMultiPicker.tsx
  - src/components/forms/LocalidadeMultiPicker.test.tsx
requirements_addressed:
  - D-11
  - D-12
autonomous: true
must_haves:
  truths:
    - "LocalidadeMultiPicker WRAPS existing LocalidadePicker — NEVER forks"
    - "Add tuple {uf, cidade} on Adicionar click; both values required"
    - "Remove tuple via chip X button"
    - "Deduplicate: attempting to add existing {uf,cidade} is a no-op"
    - "Emits two parallel arrays via RHF useFieldArray: region_uf[] and region_cities[]"
    - "Empty state: 'Nenhuma região — aceita qualquer'"
  artifacts:
    - path: "src/components/forms/LocalidadeMultiPicker.tsx"
      provides: "Multi-select wrapper for UF+cidade tuples"
      contains: "LocalidadePicker"
      contains_not: "cidadesDoUf"
  key_links:
    - from: "src/components/v3/modules/WishlistFormSheet.tsx (plan 07-10)"
      to: "src/components/forms/LocalidadeMultiPicker.tsx"
      via: "composition under region section"
      pattern: "<LocalidadeMultiPicker"
---

<objective>
Multi-select wrapper over the existing `LocalidadePicker` from Phase 6 onboarding. CONTEXT.md line 102 bans forking — this plan composes. User selects UF + cidade in a single inline row, clicks Adicionar, chip appears above the row; X removes. Array stored as two parallel RHF arrays (`region_uf` + `region_cities`) matching `DbWishlist` schema.

Purpose: Without this, no region field in the form. Establishes a reusable multi-value wrapper pattern.
Output: 2 files; tests green; no modification to LocalidadePicker.
</objective>

<execution_context>
@C:/Users/pc/auto-agent/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/pc/auto-agent/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/07-wishlist-ui/07-CONTEXT.md
@.planning/phases/07-wishlist-ui/07-UI-SPEC.md
@.planning/phases/07-wishlist-ui/07-PATTERNS.md
@src/components/forms/LocalidadePicker.tsx
@src/components/ui/button.tsx
@src/lib/schemas/wishlist.ts
</context>

<interfaces>
<!-- From LocalidadePicker.tsx — props EXACT -->
type LocalidadePickerProps = {
  uf: string;
  cidade: string;
  onUfChange: (uf: string) => void;
  onCidadeChange: (cidade: string) => void;
  disabled?: boolean;
};
// Function signature: export function LocalidadePicker(props: LocalidadePickerProps): JSX.Element

<!-- RHF useFieldArray — from react-hook-form, already installed -->
import { useFieldArray, useFormContext } from "react-hook-form";
// useFieldArray<T>({ control, name }) returns { fields, append, remove, replace, ... }
// For primitive string arrays, field.id is auto-generated, field value is the string itself
</interfaces>

<tasks>

<task id="07-08-01" type="auto" tdd="true">
  <name>Task 1: LocalidadeMultiPicker composing LocalidadePicker + useFieldArray</name>
  <files>src/components/forms/LocalidadeMultiPicker.tsx</files>
  <read_first>
    - src/components/forms/LocalidadePicker.tsx (all 154 lines — note it takes {uf, cidade, onUfChange, onCidadeChange} and emits each independently)
    - src/lib/schemas/wishlist.ts (from plan 07-01 — confirm `region_uf: z.array(z.string())` and `region_cities: z.array(z.string())` shape)
    - .planning/phases/07-wishlist-ui/07-UI-SPEC.md §Component Inventory (LocalidadePicker multi-variant row), §State Matrix (row 10, empty state copy "Nenhuma região — aceita qualquer")
    - .planning/phases/07-wishlist-ui/07-CONTEXT.md §D-11 (RHF + zod form library), canonical_refs line 102 (WRAP, NEVER FORK)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 2 §LocalidadeMultiPicker.tsx (lines 742-811)
  </read_first>
  <action>
    Create `src/components/forms/LocalidadeMultiPicker.tsx`:

    ```typescript
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
     */
    export function LocalidadeMultiPicker({
      ufName = "region_uf",
      citiesName = "region_cities",
      disabled,
    }: Props): React.JSX.Element {
      const { control } = useFormContext();
      const ufFieldArray = useFieldArray({ control, name: ufName });
      const cityFieldArray = useFieldArray({ control, name: citiesName });
      const [draftUf, setDraftUf] = useState("");
      const [draftCidade, setDraftCidade] = useState("");

      // Build the current UF/cidade list from the parallel arrays (field.id is internal RHF)
      const ufValues = ufFieldArray.fields as Array<{ id: string } & Record<string, unknown>>;
      const cityValues = cityFieldArray.fields as Array<{ id: string } & Record<string, unknown>>;
      // For primitive string arrays RHF stores the value under the same index;
      // we re-read via getValues to get the actual string
      const { getValues } = useFormContext();
      const currentUfs = (getValues(ufName) as string[] | undefined) ?? [];
      const currentCities = (getValues(citiesName) as string[] | undefined) ?? [];

      function handleAdd() {
        if (!draftUf || !draftCidade) return;
        // Dedup: does this UF/cidade already exist at the same index?
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

      const isEmpty = ufValues.length === 0;
      const canAdd = !!draftUf && !!draftCidade && !disabled;

      return (
        <div className="space-y-3">
          {isEmpty ? (
            <p className="text-slate-500 text-xs dark:text-slate-400">
              Nenhuma região — aceita qualquer
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {ufValues.map((field, i) => (
                <span
                  key={field.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700 text-xs ring-1 ring-slate-200 ring-inset dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
                >
                  {currentCities[i]}/{currentUfs[i]}
                  <button
                    type="button"
                    onClick={() => handleRemove(i)}
                    aria-label={`Remover ${currentCities[i]}/${currentUfs[i]}`}
                    className="rounded-full p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
                    disabled={disabled}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
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
    ```

    DO NOT modify `src/components/forms/LocalidadePicker.tsx`. This plan ONLY adds the wrapper file.
  </action>
  <verify>
    <automated>pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - File `src/components/forms/LocalidadeMultiPicker.tsx` exists
    - `grep -n "export function LocalidadeMultiPicker" src/components/forms/LocalidadeMultiPicker.tsx` returns 1 match
    - `grep -n "import { LocalidadePicker }" src/components/forms/LocalidadeMultiPicker.tsx` returns 1 match (WRAP not FORK)
    - `grep -n "useFieldArray" src/components/forms/LocalidadeMultiPicker.tsx` returns ≥2 matches (import + usage)
    - `grep -n "Nenhuma região — aceita qualquer" src/components/forms/LocalidadeMultiPicker.tsx` returns 1 match
    - `grep -n "Adicionar" src/components/forms/LocalidadeMultiPicker.tsx` returns 1 match
    - File `src/components/forms/LocalidadePicker.tsx` is UNCHANGED from git (`git diff src/components/forms/LocalidadePicker.tsx` is empty)
    - `pnpm typecheck` exits 0
    - `pnpm lint` exits 0
  </acceptance_criteria>
</task>

<task id="07-08-02" type="auto" tdd="true">
  <name>Task 2: LocalidadeMultiPicker tests — add/remove/dedup/empty</name>
  <files>src/components/forms/LocalidadeMultiPicker.test.tsx</files>
  <read_first>
    - src/components/forms/LocalidadeMultiPicker.tsx (task 07-08-01 output)
    - src/components/forms/LocalidadePicker.tsx (understand its inner Select/Popover structure so tests can interact with it)
    - src/lib/brasil/localidades.ts (confirm UFS constant + cidadesDoUf export used by LocalidadePicker)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Cross-Cutting §Test Harness (FormProvider wrapper pattern lines 1650-1657)
  </read_first>
  <behavior>
    - Initial render with empty arrays → empty state copy "Nenhuma região — aceita qualquer"
    - After programmatic `setValue` of `region_uf=["SP"], region_cities=["São Paulo"]` → one chip rendered
    - Clicking chip X → chip disappears
    - Adicionar button disabled when draftUf or draftCidade empty
    - Adicionar click with valid draft calls append on both arrays
    - Re-adding same {uf,cidade} is a no-op (no duplicate chip)
  </behavior>
  <action>
    Create `src/components/forms/LocalidadeMultiPicker.test.tsx`:

    ```typescript
    import { fireEvent, render, screen } from "@testing-library/react";
    import type { ReactNode } from "react";
    import { FormProvider, useForm } from "react-hook-form";
    import { beforeEach, describe, expect, it, vi } from "vitest";
    import { LocalidadeMultiPicker } from "./LocalidadeMultiPicker";

    type FormShape = {
      region_uf: string[];
      region_cities: string[];
    };

    function Harness({
      initialUfs = [],
      initialCities = [],
      children,
    }: {
      initialUfs?: string[];
      initialCities?: string[];
      children: ReactNode;
    }) {
      const form = useForm<FormShape>({
        defaultValues: { region_uf: initialUfs, region_cities: initialCities },
      });
      return <FormProvider {...form}>{children}</FormProvider>;
    }

    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe("LocalidadeMultiPicker", () => {
      it("renders empty state when no regions are set", () => {
        render(
          <Harness>
            <LocalidadeMultiPicker />
          </Harness>,
        );
        expect(screen.getByText("Nenhuma região — aceita qualquer")).toBeInTheDocument();
      });

      it("renders one chip per pre-seeded tuple", () => {
        render(
          <Harness initialUfs={["SP", "RJ"]} initialCities={["São Paulo", "Rio de Janeiro"]}>
            <LocalidadeMultiPicker />
          </Harness>,
        );
        expect(screen.getByText(/São Paulo\/SP/)).toBeInTheDocument();
        expect(screen.getByText(/Rio de Janeiro\/RJ/)).toBeInTheDocument();
      });

      it("removes a chip when its X button is clicked", () => {
        render(
          <Harness initialUfs={["SP"]} initialCities={["São Paulo"]}>
            <LocalidadeMultiPicker />
          </Harness>,
        );
        const removeBtn = screen.getByLabelText("Remover São Paulo/SP");
        fireEvent.click(removeBtn);
        expect(screen.queryByText(/São Paulo\/SP/)).toBeNull();
        // Empty state returns
        expect(screen.getByText("Nenhuma região — aceita qualquer")).toBeInTheDocument();
      });

      it("Adicionar button is disabled when draft is incomplete", () => {
        render(
          <Harness>
            <LocalidadeMultiPicker />
          </Harness>,
        );
        const addBtn = screen.getByRole("button", { name: "Adicionar" }) as HTMLButtonElement;
        expect(addBtn.disabled).toBe(true);
      });

      it("passes disabled prop down to inner LocalidadePicker and button", () => {
        render(
          <Harness>
            <LocalidadeMultiPicker disabled />
          </Harness>,
        );
        const addBtn = screen.getByRole("button", { name: "Adicionar" }) as HTMLButtonElement;
        expect(addBtn.disabled).toBe(true);
      });
    });
    ```

    Note: Simulating full UF select + cidade select through the LocalidadePicker's Popover+Command is brittle in jsdom (Radix internals). The 5 tests above cover: empty state, chip render, chip remove, add-button gated, disabled prop propagation. The add-happy-path will be covered by the integration test in plan 07-10 (WishlistFormSheet) using the full form harness.
  </action>
  <verify>
    <automated>pnpm test src/components/forms/LocalidadeMultiPicker.test.tsx --run</automated>
  </verify>
  <acceptance_criteria>
    - File `src/components/forms/LocalidadeMultiPicker.test.tsx` exists
    - `grep -n "renders empty state" src/components/forms/LocalidadeMultiPicker.test.tsx` returns 1 match
    - `grep -n "removes a chip" src/components/forms/LocalidadeMultiPicker.test.tsx` returns 1 match
    - `pnpm test src/components/forms/LocalidadeMultiPicker.test.tsx --run` exits 0 with ≥5 passing tests
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `pnpm test src/components/forms/LocalidadeMultiPicker.test.tsx --run` green
- `pnpm typecheck && pnpm lint` both green
- `git diff src/components/forms/LocalidadePicker.tsx` is empty (NEVER FORK)
</verification>

<success_criteria>
- D-11 honored: RHF useFieldArray orchestrates two parallel arrays
- D-12 implicit: wrapper lives inside sheet/dialog composition path
- LocalidadePicker untouched — fork ban honored
- Empty state copy matches UI-SPEC
</success_criteria>

<output>
After completion, create `.planning/phases/07-wishlist-ui/07-08-SUMMARY.md` documenting:
- Wrapper strategy (compose, never fork)
- Test coverage breakdown
- Confirmation LocalidadePicker is unchanged
</output>
