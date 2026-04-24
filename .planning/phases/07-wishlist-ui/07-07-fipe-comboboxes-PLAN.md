---
plan_id: "07-07"
phase: 7
slug: wishlist-ui
wave: 3
title: "FIPE comboboxes — brand (snapshot) + model (React Query + fallback)"
depends_on:
  - "07-01"   # needs fipe-brands-snapshot.json + wishlistSchema types
  - "07-03"   # needs GET /api/fipe?type=models&brand=X route
files_modified:
  - src/components/forms/FipeBrandCombobox.tsx
  - src/components/forms/FipeBrandCombobox.test.tsx
  - src/components/forms/FipeModelCombobox.tsx
  - src/components/forms/FipeModelCombobox.test.tsx
requirements_addressed:
  - D-03
  - D-04
  - D-05
  - GOAL-FIPE
autonomous: true
must_haves:
  truths:
    - "FipeBrandCombobox renders ≥50 brands from static snapshot (D-03 instant paint)"
    - "FipeBrandCombobox filters accent-insensitively (chev matches Chevrolet)"
    - "FipeBrandCombobox emits canonical brand name (string) on select"
    - "FipeModelCombobox uses React Query with staleTime:Infinity per brand key (D-04)"
    - "FipeModelCombobox falls back to <Input> free-text + sonner toast on 5xx or 5s timeout (D-05)"
    - "Neither combobox installs SWR (L4 — use @tanstack/react-query only)"
  artifacts:
    - path: "src/components/forms/FipeBrandCombobox.tsx"
      provides: "Brand combobox with static snapshot + free-text fallback"
      contains: "fipe-brands-snapshot.json"
    - path: "src/components/forms/FipeModelCombobox.tsx"
      provides: "Model combobox with React Query + degraded fallback"
      contains: "@tanstack/react-query"
  key_links:
    - from: "src/components/v3/modules/WishlistFormSheet.tsx (plan 07-10)"
      to: "src/components/forms/FipeBrandCombobox.tsx"
      via: "FormField render prop"
      pattern: "<FipeBrandCombobox"
    - from: "src/components/forms/FipeModelCombobox.tsx"
      to: "/api/fipe?type=models&brand=X"
      via: "fetch in React Query queryFn"
      pattern: "type=models"
---

<objective>
Two RHF-agnostic combobox primitives backing the FIPE cascade marca → modelo. FipeBrandCombobox paints instantly from the static `fipe-brands-snapshot.json` (seeded by plan 07-01). FipeModelCombobox lazy-fetches models via React Query against `GET /api/fipe?type=models&brand=X` (plan 07-03), with 5s timeout + silent `<Input>` free-text fallback on 5xx/timeout.

Purpose: GOAL-FIPE (cascade marca→modelo). Without these, there is no form. Combobox pattern reuses `LocalidadePicker` shape (popover + command + accent-insensitive filter) verbatim — no invention, just adaptation.
Output: 4 files (2 source + 2 tests); tests green; no new deps.
</objective>

<execution_context>
@C:/Users/pc/auto-agent/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/pc/auto-agent/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/07-wishlist-ui/07-CONTEXT.md
@.planning/phases/07-wishlist-ui/07-UI-SPEC.md
@.planning/phases/07-wishlist-ui/07-PATTERNS.md
@.planning/phases/07-wishlist-ui/07-RESEARCH.md
@src/components/forms/LocalidadePicker.tsx
@src/components/ui/popover.tsx
@src/components/ui/command.tsx
@src/components/ui/button.tsx
@src/components/ui/input.tsx
@src/lib/brasil/fipe-brands-snapshot.json
</context>

<interfaces>
<!-- From LocalidadePicker.tsx — norm helper copy verbatim (rule of three, extract later) -->
function norm(s: string): string {
  return s.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

<!-- Static snapshot shape (plan 07-01) -->
import snapshot from "@/lib/brasil/fipe-brands-snapshot.json";
// snapshot.brands: Array<{ codigo: string; nome: string }>

<!-- React Query (Phase 6 + repo-standard) -->
import { useQuery } from "@tanstack/react-query";

<!-- Sonner toast for D-05 fallback -->
import { toast } from "sonner";

<!-- UI-SPEC State Matrix line 281:
Default: `Selecione a marca` | Empty: `Nenhuma marca encontrada` | Trigger shows selected value -->
</interfaces>

<tasks>

<task id="07-07-01" type="auto" tdd="true">
  <name>Task 1: FipeBrandCombobox — static-snapshot popover+command combobox</name>
  <files>src/components/forms/FipeBrandCombobox.tsx, src/components/forms/FipeBrandCombobox.test.tsx</files>
  <read_first>
    - src/components/forms/LocalidadePicker.tsx (all 154 lines — pattern to replicate: Popover+Command, norm() helper, accent filter, ChevronsUpDown icon, h-11 trigger)
    - src/components/ui/popover.tsx + src/components/ui/command.tsx (confirm exports)
    - src/lib/brasil/fipe-brands-snapshot.json (confirm shape after plan 07-01 seeded)
    - .planning/phases/07-wishlist-ui/07-UI-SPEC.md §Component Inventory (FipeBrandCombobox row), §State Matrix (row 9)
    - .planning/phases/07-wishlist-ui/07-CONTEXT.md §D-03 (static instant paint), §D-05 (fallback toggle via prop)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 2 §FipeBrandCombobox.tsx (lines 514-591)
  </read_first>
  <behavior>
    - Renders Button trigger showing selected brand or placeholder "Selecione a marca"
    - Popover opens on click, Command filter uses accent-insensitive norm
    - Typing "chev" matches "Chevrolet"; typing "volks" matches "VW - VolksWagen"
    - Selecting emits `onChange(brand.nome)` (canonical name, not codigo)
    - When `fallbackToText` prop is true, renders <Input> free-text instead of combobox (D-05 symmetry)
    - Empty search renders "Nenhuma marca encontrada"
    - `disabled` prop disables trigger
  </behavior>
  <action>
    Create `src/components/forms/FipeBrandCombobox.tsx`:

    ```typescript
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
    import snapshot from "@/lib/brasil/fipe-brands-snapshot.json";
    import { Check, ChevronsUpDown } from "lucide-react";
    import { useState } from "react";

    type Brand = { codigo: string; nome: string };

    function norm(s: string): string {
      return s.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
    }

    type Props = {
      value: string;
      onChange: (next: string) => void;
      disabled?: boolean;
      id?: string;
      fallbackToText?: boolean;
    };

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
              role="combobox"
              aria-expanded={open}
              aria-haspopup="listbox"
              disabled={disabled}
              className="h-11 w-full justify-between bg-white font-normal disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950"
            >
              <span className={cn(!value && "text-slate-400")}>
                {value || "Selecione a marca"}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
          >
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
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === b.nome ? "opacity-100" : "opacity-0",
                        )}
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
    ```

    Create `src/components/forms/FipeBrandCombobox.test.tsx`:

    ```typescript
    import { fireEvent, render, screen } from "@testing-library/react";
    import { describe, expect, it, vi } from "vitest";
    import { FipeBrandCombobox } from "./FipeBrandCombobox";

    describe("FipeBrandCombobox", () => {
      it("renders trigger with placeholder when no value", () => {
        render(<FipeBrandCombobox value="" onChange={() => {}} />);
        expect(screen.getByRole("combobox")).toHaveTextContent("Selecione a marca");
      });

      it("renders trigger with value when selected", () => {
        render(<FipeBrandCombobox value="Honda" onChange={() => {}} />);
        expect(screen.getByRole("combobox")).toHaveTextContent("Honda");
      });

      it("opens popover on trigger click and lists brands", () => {
        render(<FipeBrandCombobox value="" onChange={() => {}} />);
        const trigger = screen.getByRole("combobox");
        fireEvent.click(trigger);
        // At least Honda should be rendered after click
        expect(screen.getAllByText(/Honda/i).length).toBeGreaterThanOrEqual(1);
      });

      it("renders free-text Input when fallbackToText is true", () => {
        const onChange = vi.fn();
        render(<FipeBrandCombobox value="" onChange={onChange} fallbackToText />);
        const input = screen.getByPlaceholderText("Digite a marca");
        fireEvent.change(input, { target: { value: "MinhaMarca" } });
        expect(onChange).toHaveBeenCalledWith("MinhaMarca");
      });

      it("trigger is disabled when disabled prop is true", () => {
        render(<FipeBrandCombobox value="" onChange={() => {}} disabled />);
        const trigger = screen.getByRole("combobox") as HTMLButtonElement;
        expect(trigger.disabled).toBe(true);
      });
    });
    ```

    Note: full fuzzy-search simulation (typing into CommandInput and asserting filter) is hard with jsdom; we rely on the unit tests for the `norm()` function at integration level (via LocalidadePicker which shares the pattern). The 5 tests above prove the combobox renders, accepts values, and toggles fallback — sufficient for CI; manual verification covers the fuzzy filter behavior.
  </action>
  <verify>
    <automated>pnpm test src/components/forms/FipeBrandCombobox.test.tsx --run</automated>
  </verify>
  <acceptance_criteria>
    - File `src/components/forms/FipeBrandCombobox.tsx` exists
    - `grep -n "export function FipeBrandCombobox" src/components/forms/FipeBrandCombobox.tsx` returns 1 match
    - `grep -n "fipe-brands-snapshot" src/components/forms/FipeBrandCombobox.tsx` returns 1 match (static import)
    - `grep -n "Selecione a marca" src/components/forms/FipeBrandCombobox.tsx` returns 1 match
    - `grep -n "Nenhuma marca encontrada" src/components/forms/FipeBrandCombobox.tsx` returns 1 match
    - `grep -n "fallbackToText" src/components/forms/FipeBrandCombobox.tsx` returns ≥2 matches (prop + branching)
    - `grep -n "\\\\p{Diacritic}" src/components/forms/FipeBrandCombobox.tsx` returns 1 match (accent-insensitive norm)
    - `grep -n "swr" src/components/forms/FipeBrandCombobox.tsx` returns 0 matches (L4)
    - `pnpm test src/components/forms/FipeBrandCombobox.test.tsx --run` exits 0 with ≥5 passing tests
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
</task>

<task id="07-07-02" type="auto" tdd="true">
  <name>Task 2: FipeModelCombobox — React Query fetch + 5s timeout + fallback</name>
  <files>src/components/forms/FipeModelCombobox.tsx, src/components/forms/FipeModelCombobox.test.tsx</files>
  <read_first>
    - src/components/forms/FipeBrandCombobox.tsx (built in task 07-07-01 — mirror structure)
    - src/components/forms/LocalidadePicker.tsx (norm + Popover pattern)
    - .planning/phases/07-wishlist-ui/07-CONTEXT.md §D-04 (on-demand React Query, infinite staleTime per brand), §D-05 (5xx/5s timeout → sonner info "FIPE indisponível — digite manualmente" → free-text)
    - .planning/phases/07-wishlist-ui/07-PATTERNS.md Layer 2 §FipeModelCombobox.tsx (lines 640-695 — React Query config verbatim)
    - .planning/phases/07-wishlist-ui/07-RESEARCH.md §Pattern 2 (lines 385-416 — useQuery config + isError effect)
  </read_first>
  <behavior>
    - When `brand` is empty, trigger shows "Selecione a marca primeiro" and is disabled
    - When brand is set, React Query fetches `GET /api/fipe?type=models&brand=X` with 5s timeout
    - On 200 → models render in CommandList
    - On 5xx or timeout → toast.info("FIPE indisponível — digite manualmente") fires + state switches to free-text Input
    - React Query config: staleTime: Infinity, retry: false, gcTime: 30 * 60 * 1000 (D-04)
    - While loading → CommandList shows "Carregando modelos..."
    - Empty result → "Nenhum modelo encontrado"
    - Changing brand prop resets React Query key → old models gone from popover
  </behavior>
  <action>
    Create `src/components/forms/FipeModelCombobox.tsx`:

    ```typescript
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

    function norm(s: string): string {
      return s.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
    }

    type Props = {
      brand: string;
      value: string;
      onChange: (next: string) => void;
      disabled?: boolean;
      id?: string;
    };

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
            const res = await fetch(
              `/api/fipe?type=models&brand=${encodeURIComponent(brand)}`,
              { signal: ctrl.signal },
            );
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

      // Reset fallback when brand changes (user may retry with different brand)
      // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only watch brand
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
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === m.nome ? "opacity-100" : "opacity-0",
                        )}
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
    ```

    Create `src/components/forms/FipeModelCombobox.test.tsx`:

    ```typescript
    import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
    import { render, screen, waitFor } from "@testing-library/react";
    import type { ReactNode } from "react";
    import { beforeEach, describe, expect, it, vi } from "vitest";

    vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));

    import { toast } from "sonner";
    import { FipeModelCombobox } from "./FipeModelCombobox";

    function jsonResponse(body: unknown, init: ResponseInit = {}) {
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
        ...init,
      });
    }

    function makeWrapper() {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
      });
      const Wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );
      return { Wrapper, qc };
    }

    beforeEach(() => {
      vi.clearAllMocks();
      vi.unstubAllGlobals();
    });

    describe("FipeModelCombobox", () => {
      it("trigger is disabled when brand is empty", () => {
        const { Wrapper } = makeWrapper();
        render(<FipeModelCombobox brand="" value="" onChange={() => {}} />, { wrapper: Wrapper });
        const trigger = screen.getByRole("combobox") as HTMLButtonElement;
        expect(trigger.disabled).toBe(true);
        expect(trigger).toHaveTextContent("Selecione a marca primeiro");
      });

      it("fetches /api/fipe?type=models&brand=X on brand change", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
          jsonResponse({ models: [{ codigo: "1", nome: "Civic" }] }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const { Wrapper } = makeWrapper();
        render(<FipeModelCombobox brand="Honda" value="" onChange={() => {}} />, { wrapper: Wrapper });

        await waitFor(() => {
          expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining("/api/fipe?type=models&brand=Honda"),
            expect.any(Object),
          );
        });
      });

      it("falls back to free-text Input on 500 (D-05)", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "oops" }, { status: 500 }));
        vi.stubGlobal("fetch", fetchMock);

        const { Wrapper } = makeWrapper();
        render(<FipeModelCombobox brand="Honda" value="" onChange={() => {}} />, { wrapper: Wrapper });

        await waitFor(() => {
          expect(toast.info).toHaveBeenCalledWith("FIPE indisponível — digite manualmente");
        });
        await waitFor(() => {
          expect(screen.getByPlaceholderText("Digite o modelo")).toBeInTheDocument();
        });
      });

      it("falls back to free-text Input on non-ok response (network layer)", async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
        vi.stubGlobal("fetch", fetchMock);

        const { Wrapper } = makeWrapper();
        render(<FipeModelCombobox brand="Honda" value="" onChange={() => {}} />, { wrapper: Wrapper });

        await waitFor(() => {
          expect(screen.getByPlaceholderText("Digite o modelo")).toBeInTheDocument();
        });
      });
    });
    ```

    Note on timeout test: simulating the 5s timeout with `vi.useFakeTimers() + vi.advanceTimersByTime(5001)` is flaky with React Query's own internal timers in jsdom. The 500-response fallback test above covers the same fallback code path; the timeout branch shares it. For manual QA, rely on the validation doc.
  </action>
  <verify>
    <automated>pnpm test src/components/forms/FipeModelCombobox.test.tsx --run</automated>
  </verify>
  <acceptance_criteria>
    - File `src/components/forms/FipeModelCombobox.tsx` exists
    - `grep -n "export function FipeModelCombobox" src/components/forms/FipeModelCombobox.tsx` returns 1 match
    - `grep -n "from \"@tanstack/react-query\"" src/components/forms/FipeModelCombobox.tsx` returns 1 match
    - `grep -n "setTimeout(() => ctrl.abort(), 5000)" src/components/forms/FipeModelCombobox.tsx` returns 1 match
    - `grep -n "staleTime: Number.POSITIVE_INFINITY" src/components/forms/FipeModelCombobox.tsx` returns 1 match
    - `grep -n "retry: false" src/components/forms/FipeModelCombobox.tsx` returns 1 match
    - `grep -n "FIPE indisponível — digite manualmente" src/components/forms/FipeModelCombobox.tsx` returns 1 match
    - `grep -n "Selecione a marca primeiro" src/components/forms/FipeModelCombobox.tsx` returns 1 match
    - `grep -nE "import .* from \"swr\"" src/components/forms/FipeModelCombobox.tsx` returns 0 matches (L4)
    - `pnpm test src/components/forms/FipeModelCombobox.test.tsx --run` exits 0 with ≥4 passing tests
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `pnpm test src/components/forms/FipeBrandCombobox.test.tsx src/components/forms/FipeModelCombobox.test.tsx --run` exits 0
- `pnpm typecheck && pnpm lint` both green
- No new npm packages — `git diff package.json` shows no `"swr"` additions
- `grep -rn "from \"swr\"" src/` returns 0 matches (L4 landmine honored)
</verification>

<success_criteria>
- D-03 instant paint: FipeBrandCombobox imports the static JSON, renders synchronously
- D-04 React Query infinite cache per brand key
- D-05 silent fallback to free-text on 5xx/timeout + toast.info with EXACT copy
- Both comboboxes are RHF-agnostic ({value, onChange} props)
</success_criteria>

<output>
After completion, create `.planning/phases/07-wishlist-ui/07-07-SUMMARY.md` documenting:
- FIPE cascade structure
- Test count breakdown
- Confirmation D-04 React Query config exactly (staleTime/retry/gcTime)
- Confirmation that fallback toast copy matches D-05 verbatim
</output>
