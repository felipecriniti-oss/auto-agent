---
plan_id: "07-06"
phase: 7
slug: wishlist-ui
wave: 2
title: "Field primitives — BrlCurrencyInput + KmInput + YearRangeField"
depends_on:
  - "07-01"   # needs WishlistFormValues type + Reais alias
files_modified:
  - src/components/forms/BrlCurrencyInput.tsx
  - src/components/forms/BrlCurrencyInput.test.tsx
  - src/components/forms/KmInput.tsx
  - src/components/forms/KmInput.test.tsx
  - src/components/forms/YearRangeField.tsx
  - src/components/forms/YearRangeField.test.tsx
requirements_addressed:
  - D-06
  - D-11
autonomous: true
must_haves:
  truths:
    - "BrlCurrencyInput round-trips integer reais: receives 130000 → displays 'R$ 130.000' → emits 130000"
    - "BrlCurrencyInput handles null: receives null → displays empty → emits null when cleared"
    - "KmInput round-trips integer km same way, displays '80.000' without R$ prefix, with 'km' suffix visual"
    - "YearRangeField renders two inputs in grid-cols-2 gap-3, shared label 'Ano', emits null on empty"
    - "Primitives are RHF-agnostic: { value, onChange, disabled? } props — no RHF imports inside"
  artifacts:
    - path: "src/components/forms/BrlCurrencyInput.tsx"
      provides: "Controlled BRL input with pt-BR mask"
      contains: "toLocaleString(\"pt-BR\""
    - path: "src/components/forms/KmInput.tsx"
      provides: "Controlled km input with pt-BR thousand separator"
    - path: "src/components/forms/YearRangeField.tsx"
      provides: "Paired number inputs for year_min + year_max"
      contains: "grid grid-cols-2"
  key_links:
    - from: "src/components/v3/modules/WishlistFormSheet.tsx (plan 07-10)"
      to: "src/components/forms/BrlCurrencyInput.tsx"
      via: "FormField render prop"
      pattern: "<BrlCurrencyInput"
---

<objective>
Three small, RHF-agnostic field primitives that compose into the Wishlist form (plan 07-10). Each takes a simple `{ value, onChange, disabled? }` prop surface — the form wrapper layer handles RHF wiring via `FormField render={({ field }) => <Primitive value={field.value} onChange={field.onChange} />}`. Keeps primitives testable in isolation and reusable outside RHF if needed.

Purpose: Without these, `WishlistFormSheet` cannot render price/km/year ranges. Establishes the pt-BR number-input pattern repo-wide (future billing form will mirror).
Output: 6 files (3 source + 3 tests), all tests green, pt-BR formatting verified.
</objective>

<execution_context>
@C:/Users/pc/auto-agent/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/pc/auto-agent/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/07-wishlist-ui/07-CONTEXT.md
@.planning/phases/07-wishlist-ui/07-UI-SPEC.md
@.planning/phases/07-wishlist-ui/07-PATTERNS.md
@src/app/app/onboarding/page.tsx
@src/components/v3/modules/WishlistModule.tsx
@src/components/ui/input.tsx
</context>

<interfaces>
<!-- From plan 07-01 — Reais type alias available -->
import type { Reais } from "@/lib/schemas/wishlist";

<!-- From src/components/v3/modules/WishlistModule.tsx:82-85 — formatBrl helper to mirror -->
function formatBrl(v: number | null): string {
  if (v == null) return "—";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

<!-- From src/app/app/onboarding/page.tsx:34-42 — mask pattern (strip non-digits on input) -->
const digits = raw.replace(/\D/g, "").slice(0, N);
</interfaces>

<tasks>

<task id="07-06-01" type="auto" tdd="true">
  <name>Task 1: BrlCurrencyInput primitive + tests</name>
  <files>src/components/forms/BrlCurrencyInput.tsx, src/components/forms/BrlCurrencyInput.test.tsx</files>
  <read_first>
    - src/components/ui/input.tsx (confirm `Input` primitive shape + className conventions)
    - src/app/app/onboarding/page.tsx (lines 34-60 — maskCnpj pattern + Input usage with inputMode="numeric" + h-11 + bg-white dark:bg-slate-950)
    - src/components/v3/modules/WishlistModule.tsx (lines 82-85 — formatBrl helper verbatim)
    - .planning/phases/07-wishlist-ui/07-CONTEXT.md §D-06 (integer reais, no cents, BrlCurrencyInput emits integer)
    - .planning/phases/07-wishlist-ui/07-UI-SPEC.md (accent reservation — BRL is NOT an accent carrier)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 2 §BrlCurrencyInput.tsx (lines 840-902 — shape + divergence rules)
  </read_first>
  <behavior>
    - Typing "130000" → internally strips non-digits → onChange(130000); display re-renders as "R$ 130.000"
    - Receiving value={130000} prop → input value shows "R$ 130.000"
    - Clearing input (delete all) → onChange(null); display shows empty placeholder
    - value={null} prop → display empty
    - Paste behavior (W12 — single unambiguous rule): Stripping rule: all non-digit characters are removed before parsing. 'R$ 130.000' → '130000' → 130000 (integer reais). 'abc130.000,50' → '13000050' (conceptually wrong BUT benign: Zod rejects price > 5,000,000 at submit time, so this input cannot pass validation). The component never attempts to interpret commas or periods as decimal separators — D-06 locks integer reais with no cents.
    - `disabled` prop disables the input
    - `pnpm typecheck` passes — Reais type imported
  </behavior>
  <action>
    Create `src/components/forms/BrlCurrencyInput.tsx`:

    ```typescript
    "use client";

    import { Input } from "@/components/ui/input";
    import { cn } from "@/lib/utils";
    import type { Reais } from "@/lib/schemas/wishlist";
    import { useMemo } from "react";

    type Props = {
      value: Reais | null;
      onChange: (next: Reais | null) => void;
      placeholder?: string;
      disabled?: boolean;
      id?: string;
      className?: string;
    };

    /**
     * Controlled BRL currency input.
     * - Stores integer reais (no cents) per D-06.
     * - Displays as `R$ 130.000` with pt-BR thousand separator.
     * - Emits null when cleared.
     *
     * Stripping rule (W12): all non-digit characters are removed before parsing.
     *   'R$ 130.000' → '130000' → 130000 (integer reais).
     *   'abc130.000,50' → '13000050' (conceptually wrong BUT benign: Zod rejects
     *   price > 5,000,000 at submit time, so this input cannot pass validation).
     * The component never attempts to interpret commas or periods as decimal
     * separators — D-06 locks integer reais with no cents.
     */
    export function BrlCurrencyInput({
      value,
      onChange,
      placeholder = "R$ 0",
      disabled,
      id,
      className,
    }: Props): React.JSX.Element {
      const display = useMemo(() => {
        if (value == null) return "";
        return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
      }, [value]);

      function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
        const digits = e.target.value.replace(/\D/g, "");
        if (digits.length === 0) {
          onChange(null);
          return;
        }
        onChange(Number.parseInt(digits, 10));
      }

      return (
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("h-11 bg-white dark:bg-slate-950", className)}
        />
      );
    }
    ```

    Create `src/components/forms/BrlCurrencyInput.test.tsx`:

    ```typescript
    import { fireEvent, render, screen } from "@testing-library/react";
    import { describe, expect, it, vi } from "vitest";
    import { BrlCurrencyInput } from "./BrlCurrencyInput";

    describe("BrlCurrencyInput", () => {
      it("displays R$ 130.000 when value is 130000", () => {
        render(<BrlCurrencyInput value={130000} onChange={() => {}} />);
        const input = screen.getByRole("textbox") as HTMLInputElement;
        expect(input.value).toBe("R$ 130.000");
      });

      it("displays empty when value is null", () => {
        render(<BrlCurrencyInput value={null} onChange={() => {}} />);
        const input = screen.getByRole("textbox") as HTMLInputElement;
        expect(input.value).toBe("");
      });

      it("emits integer reais on type — '130000' → 130000", () => {
        const onChange = vi.fn();
        render(<BrlCurrencyInput value={null} onChange={onChange} />);
        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "130000" } });
        expect(onChange).toHaveBeenCalledWith(130000);
      });

      it("strips non-digits on paste — '130.000' → 130000", () => {
        const onChange = vi.fn();
        render(<BrlCurrencyInput value={null} onChange={onChange} />);
        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "R$ 130.000" } });
        expect(onChange).toHaveBeenCalledWith(130000);
      });

      it("emits null when cleared", () => {
        const onChange = vi.fn();
        render(<BrlCurrencyInput value={130000} onChange={onChange} />);
        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "" } });
        expect(onChange).toHaveBeenCalledWith(null);
      });

      it("strips letters — 'abc130000' → 130000", () => {
        const onChange = vi.fn();
        render(<BrlCurrencyInput value={null} onChange={onChange} />);
        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "abc130000" } });
        expect(onChange).toHaveBeenCalledWith(130000);
      });

      it("is disabled when disabled prop is true", () => {
        render(<BrlCurrencyInput value={null} onChange={() => {}} disabled />);
        const input = screen.getByRole("textbox") as HTMLInputElement;
        expect(input.disabled).toBe(true);
      });
    });
    ```
  </action>
  <verify>
    <automated>pnpm test src/components/forms/BrlCurrencyInput.test.tsx --run</automated>
  </verify>
  <acceptance_criteria>
    - File `src/components/forms/BrlCurrencyInput.tsx` exists
    - `grep -n "export function BrlCurrencyInput" src/components/forms/BrlCurrencyInput.tsx` returns 1 match
    - `grep -n "toLocaleString(\"pt-BR\"" src/components/forms/BrlCurrencyInput.tsx` returns 1 match
    - `grep -n "replace(/\\\\D/g" src/components/forms/BrlCurrencyInput.tsx` returns 1 match (digit-only mask)
    - `grep -n "import type { Reais }" src/components/forms/BrlCurrencyInput.tsx` returns 1 match
    - `pnpm test src/components/forms/BrlCurrencyInput.test.tsx --run` exits 0 with 7 passing tests
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
</task>

<task id="07-06-02" type="auto" tdd="true">
  <name>Task 2: KmInput primitive + tests (BRL twin without R$ prefix)</name>
  <files>src/components/forms/KmInput.tsx, src/components/forms/KmInput.test.tsx</files>
  <read_first>
    - src/components/forms/BrlCurrencyInput.tsx (built in task 07-06-01 — KmInput is its near-twin)
    - .planning/phases/07-wishlist-ui/07-CONTEXT.md §D-06 (integer km, km_max emits integer)
    - .planning/phases/07-wishlist-ui/07-UI-SPEC.md (State Matrix line 279 — km suffix inside label or right-aligned)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 2 §KmInput.tsx (lines 906-920)
  </read_first>
  <behavior>
    - Typing "80000" → onChange(80000); display "80.000" (NO R$ prefix)
    - Receiving value={80000} → input value "80.000"
    - Clearing → onChange(null)
    - value={null} → empty
    - Letters stripped
    - "km" suffix rendered as right-side decoration (UI-SPEC indicates suffix inside label OR right-aligned text)
  </behavior>
  <action>
    Create `src/components/forms/KmInput.tsx`:

    ```typescript
    "use client";

    import { Input } from "@/components/ui/input";
    import { cn } from "@/lib/utils";
    import { useMemo } from "react";

    type Props = {
      value: number | null;
      onChange: (next: number | null) => void;
      placeholder?: string;
      disabled?: boolean;
      id?: string;
      className?: string;
    };

    /**
     * Controlled km input with pt-BR thousand separator.
     * - Stores integer km per D-06.
     * - Displays as `80.000` (no prefix). "km" suffix rendered by caller via Label.
     * - Emits null when cleared.
     */
    export function KmInput({
      value,
      onChange,
      placeholder = "0",
      disabled,
      id,
      className,
    }: Props): React.JSX.Element {
      const display = useMemo(() => {
        if (value == null) return "";
        return value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      }, [value]);

      function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
        const digits = e.target.value.replace(/\D/g, "");
        if (digits.length === 0) {
          onChange(null);
          return;
        }
        onChange(Number.parseInt(digits, 10));
      }

      return (
        <div className="relative">
          <Input
            id={id}
            type="text"
            inputMode="numeric"
            value={display}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            className={cn("h-11 bg-white pr-10 dark:bg-slate-950", className)}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500 text-xs dark:text-slate-400">
            km
          </span>
        </div>
      );
    }
    ```

    Create `src/components/forms/KmInput.test.tsx` — mirror BrlCurrencyInput.test.tsx structure with 6 tests:

    ```typescript
    import { fireEvent, render, screen } from "@testing-library/react";
    import { describe, expect, it, vi } from "vitest";
    import { KmInput } from "./KmInput";

    describe("KmInput", () => {
      it("displays '80.000' when value is 80000 (no R$ prefix)", () => {
        render(<KmInput value={80000} onChange={() => {}} />);
        const input = screen.getByRole("textbox") as HTMLInputElement;
        expect(input.value).toBe("80.000");
        expect(input.value).not.toContain("R$");
      });

      it("renders 'km' suffix", () => {
        render(<KmInput value={80000} onChange={() => {}} />);
        expect(screen.getByText("km")).toBeInTheDocument();
      });

      it("displays empty when value is null", () => {
        render(<KmInput value={null} onChange={() => {}} />);
        const input = screen.getByRole("textbox") as HTMLInputElement;
        expect(input.value).toBe("");
      });

      it("emits integer km on type — '80000' → 80000", () => {
        const onChange = vi.fn();
        render(<KmInput value={null} onChange={onChange} />);
        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "80000" } });
        expect(onChange).toHaveBeenCalledWith(80000);
      });

      it("strips non-digits — '80.000' → 80000", () => {
        const onChange = vi.fn();
        render(<KmInput value={null} onChange={onChange} />);
        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "80.000" } });
        expect(onChange).toHaveBeenCalledWith(80000);
      });

      it("emits null when cleared", () => {
        const onChange = vi.fn();
        render(<KmInput value={80000} onChange={onChange} />);
        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "" } });
        expect(onChange).toHaveBeenCalledWith(null);
      });
    });
    ```
  </action>
  <verify>
    <automated>pnpm test src/components/forms/KmInput.test.tsx --run</automated>
  </verify>
  <acceptance_criteria>
    - File `src/components/forms/KmInput.tsx` exists
    - `grep -n "export function KmInput" src/components/forms/KmInput.tsx` returns 1 match
    - `grep -n "toLocaleString(\"pt-BR\"" src/components/forms/KmInput.tsx` returns 1 match
    - `grep -n ">km<" src/components/forms/KmInput.tsx` returns 1 match (suffix rendered)
    - `grep -n "R\\$" src/components/forms/KmInput.tsx` returns 0 matches (no currency prefix)
    - `pnpm test src/components/forms/KmInput.test.tsx --run` exits 0 with 6 passing tests
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
</task>

<task id="07-06-03" type="auto" tdd="true">
  <name>Task 3: YearRangeField primitive + tests — dual number inputs in grid</name>
  <files>src/components/forms/YearRangeField.tsx, src/components/forms/YearRangeField.test.tsx</files>
  <read_first>
    - src/components/v3/modules/WishlistModule.tsx (lines 487-514 — scaffold's year min/max dual-input pattern)
    - src/components/ui/input.tsx
    - src/components/ui/label.tsx (FormLabel equivalent usage)
    - .planning/phases/07-wishlist-ui/07-UI-SPEC.md §Copywriting Contract (field hint: "Deixe vazio para qualquer ano")
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 2 §YearRangeField.tsx (lines 924-971)
    - .planning/phases/07-wishlist-ui/07-RESEARCH.md §Pattern 1 (Zod refine at schema level, path ["year_min"])
  </read_first>
  <behavior>
    - Renders two <Input type="number"> in `grid grid-cols-2 gap-3`
    - Shared label "Ano" ABOVE the grid (not per-input)
    - Min input placeholder "1990+", max placeholder like "2025"
    - Empty string → emits null for respective field
    - Non-empty → emits Number(value)
    - min={1990}, max={CURRENT_YEAR + 1} per schema range
    - Error message is surfaced via parent (FormField wraps this and shows FormMessage for path ["year_min"])
    - Component is agnostic to errors — it only does value roundtripping
  </behavior>
  <action>
    Create `src/components/forms/YearRangeField.tsx`:

    ```typescript
    "use client";

    import { Input } from "@/components/ui/input";
    import { Label } from "@/components/ui/label";
    import { cn } from "@/lib/utils";

    type Props = {
      valueMin: number | null;
      valueMax: number | null;
      onChangeMin: (next: number | null) => void;
      onChangeMax: (next: number | null) => void;
      disabled?: boolean;
      idMin?: string;
      idMax?: string;
      labelText?: string;
      hintText?: string;
      errorText?: string;
      className?: string;
    };

    const CURRENT_YEAR = new Date().getFullYear();

    /**
     * Dual number-input for year range (year_min + year_max).
     * - pt-BR friendly: type="number" + inputMode="numeric"
     * - Empty string → null, any numeric → Number()
     * - Shared label "Ano" above grid
     * - Error rendering handled by parent FormField via schema .refine path ["year_min"]
     */
    export function YearRangeField({
      valueMin,
      valueMax,
      onChangeMin,
      onChangeMax,
      disabled,
      idMin = "year-min",
      idMax = "year-max",
      labelText = "Ano",
      hintText = "Deixe vazio para qualquer ano",
      errorText,
      className,
    }: Props): React.JSX.Element {
      function handle(change: (v: number | null) => void) {
        return (e: React.ChangeEvent<HTMLInputElement>) => {
          const raw = e.target.value;
          change(raw === "" ? null : Number(raw));
        };
      }

      return (
        <div className={cn("space-y-1.5", className)}>
          <Label>{labelText}</Label>
          <div className="grid grid-cols-2 gap-3">
            <Input
              id={idMin}
              type="number"
              inputMode="numeric"
              min={1990}
              max={CURRENT_YEAR + 1}
              placeholder="1990+"
              value={valueMin ?? ""}
              onChange={handle(onChangeMin)}
              disabled={disabled}
              className="h-11 bg-white dark:bg-slate-950"
            />
            <Input
              id={idMax}
              type="number"
              inputMode="numeric"
              min={1990}
              max={CURRENT_YEAR + 1}
              placeholder={String(CURRENT_YEAR)}
              value={valueMax ?? ""}
              onChange={handle(onChangeMax)}
              disabled={disabled}
              className="h-11 bg-white dark:bg-slate-950"
            />
          </div>
          {errorText ? (
            <p className="text-red-600 text-xs dark:text-red-400">{errorText}</p>
          ) : (
            <p className="text-slate-500 text-xs dark:text-slate-400">{hintText}</p>
          )}
        </div>
      );
    }
    ```

    Create `src/components/forms/YearRangeField.test.tsx`:

    ```typescript
    import { fireEvent, render, screen } from "@testing-library/react";
    import { describe, expect, it, vi } from "vitest";
    import { YearRangeField } from "./YearRangeField";

    describe("YearRangeField", () => {
      it("renders two number inputs in grid layout", () => {
        const { container } = render(
          <YearRangeField valueMin={null} valueMax={null} onChangeMin={() => {}} onChangeMax={() => {}} />,
        );
        const inputs = container.querySelectorAll("input[type='number']");
        expect(inputs.length).toBe(2);
        const grid = container.querySelector(".grid.grid-cols-2");
        expect(grid).not.toBeNull();
      });

      it("displays values when provided", () => {
        render(
          <YearRangeField valueMin={2018} valueMax={2023} onChangeMin={() => {}} onChangeMax={() => {}} />,
        );
        const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
        expect(inputs[0].value).toBe("2018");
        expect(inputs[1].value).toBe("2023");
      });

      it("emits number on type", () => {
        const onMin = vi.fn();
        render(
          <YearRangeField valueMin={null} valueMax={null} onChangeMin={onMin} onChangeMax={() => {}} />,
        );
        const inputs = screen.getAllByRole("spinbutton");
        fireEvent.change(inputs[0], { target: { value: "2018" } });
        expect(onMin).toHaveBeenCalledWith(2018);
      });

      it("emits null on clear", () => {
        const onMin = vi.fn();
        render(
          <YearRangeField valueMin={2018} valueMax={null} onChangeMin={onMin} onChangeMax={() => {}} />,
        );
        const inputs = screen.getAllByRole("spinbutton");
        fireEvent.change(inputs[0], { target: { value: "" } });
        expect(onMin).toHaveBeenCalledWith(null);
      });

      it("renders hint text when no error", () => {
        render(
          <YearRangeField valueMin={null} valueMax={null} onChangeMin={() => {}} onChangeMax={() => {}} />,
        );
        expect(screen.getByText("Deixe vazio para qualquer ano")).toBeInTheDocument();
      });

      it("renders error text when errorText provided (overrides hint)", () => {
        render(
          <YearRangeField
            valueMin={2023}
            valueMax={2018}
            onChangeMin={() => {}}
            onChangeMax={() => {}}
            errorText="Ano mínimo não pode ser maior que o máximo"
          />,
        );
        expect(
          screen.getByText("Ano mínimo não pode ser maior que o máximo"),
        ).toBeInTheDocument();
        expect(screen.queryByText("Deixe vazio para qualquer ano")).toBeNull();
      });
    });
    ```
  </action>
  <verify>
    <automated>pnpm test src/components/forms/YearRangeField.test.tsx --run</automated>
  </verify>
  <acceptance_criteria>
    - File `src/components/forms/YearRangeField.tsx` exists
    - `grep -n "export function YearRangeField" src/components/forms/YearRangeField.tsx` returns 1 match
    - `grep -n "grid grid-cols-2 gap-3" src/components/forms/YearRangeField.tsx` returns 1 match
    - `grep -n "Deixe vazio para qualquer ano" src/components/forms/YearRangeField.tsx` returns 1 match
    - `grep -cE "type=\"number\"" src/components/forms/YearRangeField.tsx` returns 2
    - `pnpm test src/components/forms/YearRangeField.test.tsx --run` exits 0 with 6 passing tests
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `pnpm test src/components/forms/BrlCurrencyInput.test.tsx src/components/forms/KmInput.test.tsx src/components/forms/YearRangeField.test.tsx --run` exits 0
- `pnpm typecheck && pnpm lint` both green
- All three primitives are RHF-agnostic (no `react-hook-form` imports)
</verification>

<success_criteria>
- D-06 fully satisfied: BRL/km inputs round-trip integers without cents
- Field hint copy matches UI-SPEC verbatim
- Primitives expose `{ value, onChange }` props — RHF wrapper in plan 07-10 handles Controller integration
- W12: BrlCurrencyInput paste-behavior paragraph is now a single unambiguous statement locking the stripping rule to the digit-only mask with no decimal interpretation
- 19 tests total pass across the 3 primitives
</success_criteria>

<output>
After completion, create `.planning/phases/07-wishlist-ui/07-06-SUMMARY.md` listing:
- 3 files + 3 test files
- Test count breakdown (7 + 6 + 6 = 19)
- Confirmation: no `react-hook-form` imports (RHF-agnostic)
- W12 note: paste-behavior JSDoc locks the digit-only stripping rule (no decimal parsing)
</output>
</content>
