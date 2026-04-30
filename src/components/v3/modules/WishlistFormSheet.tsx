"use client";

import { BrlCurrencyInput } from "@/components/forms/BrlCurrencyInput";
import { FipeBrandCombobox } from "@/components/forms/FipeBrandCombobox";
import { FipeModelCombobox } from "@/components/forms/FipeModelCombobox";
import { KmInput } from "@/components/forms/KmInput";
import { LocalidadeMultiPicker } from "@/components/forms/LocalidadeMultiPicker";
import { WishlistPreviewPane } from "@/components/forms/WishlistPreviewPane";
import { YearRangeField } from "@/components/forms/YearRangeField";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { type WishlistFormValues, wishlistSchema } from "@/lib/schemas/wishlist";
import { useCreateWishlist, useUpdateWishlist } from "@/lib/supabase/hooks/useWishlists";
import { cn } from "@/lib/utils";
import { summarize } from "@/lib/wishlist/summarize";
import type { DbWishlist } from "@/types/database";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export type WishlistFormSheetProps = {
  initial?: DbWishlist | null;
  open?: boolean; // ignored for layout="inline"
  onOpenChange?: (open: boolean) => void;
  onSaved?: (saved: DbWishlist) => void | Promise<void>;
  layout?: "sheet" | "inline"; // default "sheet"
  submitLabel?: string; // default "Salvar wishlist"; onboarding step 3 passes "Salvar e começar" per UI-SPEC
};

const DEFAULT_VALUES: WishlistFormValues = {
  name: "",
  brand: "",
  model: "",
  trim: null,
  year_min: null,
  year_max: null,
  km_max: null,
  price_max: null,
  fuel_type: [],
  transmission: [],
  armored: null,
  region_uf: [],
  region_cities: [],
};

function dbToForm(w: DbWishlist): WishlistFormValues {
  return {
    name: w.name ?? "",
    brand: w.brand ?? "",
    model: w.model ?? "",
    trim: w.trim,
    year_min: w.year_min,
    year_max: w.year_max,
    km_max: w.km_max,
    price_max: w.price_max,
    fuel_type: (w.fuel_type ?? []) as WishlistFormValues["fuel_type"],
    transmission: (w.transmission ?? []) as WishlistFormValues["transmission"],
    armored: w.armored,
    region_uf: w.region_uf ?? [],
    region_cities: w.region_cities ?? [],
  };
}

/**
 * ChoiceChip — multi/single-select pill. Selected state uses #4C46DC accent
 * (UI-SPEC color accent allowlist item 5).
 */
function ChoiceChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-full px-3 py-1 font-medium text-xs ring-1 transition",
        selected
          ? "bg-[#4C46DC] text-white ring-[#4C46DC]"
          : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800",
      )}
    >
      {children}
    </button>
  );
}

const FUEL_OPTIONS: Array<WishlistFormValues["fuel_type"][number]> = [
  "flex",
  "gasolina",
  "diesel",
  "híbrido",
  "elétrico",
];
const TRANSMISSION_OPTIONS: Array<WishlistFormValues["transmission"][number]> = [
  "automático",
  "manual",
  "CVT",
];

export function WishlistFormSheet({
  initial,
  open = true,
  onOpenChange,
  onSaved,
  layout = "sheet",
  submitLabel,
}: WishlistFormSheetProps): React.JSX.Element | null {
  const isEdit = !!initial;
  const createMut = useCreateWishlist();
  const updateMut = useUpdateWishlist();
  // HIGH-01 fix: gate desktop vs mobile branch at runtime. Wrapping the mobile
  // <Dialog> in `<div className="md:hidden">` does NOT hide it on desktop because
  // Radix DialogContent portals to `document.body` and escapes the wrapper. We
  // must JSX-gate the whole subtree so exactly one branch is mounted per viewport.
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const form = useForm<WishlistFormValues>({
    // biome-ignore lint/suspicious/noExplicitAny: RHF resolver generics are famously incompatible with zod.refine-narrowed schemas; the runtime contract is correct.
    resolver: zodResolver(wishlistSchema) as any,
    mode: "onBlur",
    defaultValues: initial ? dbToForm(initial) : DEFAULT_VALUES,
  });

  // Reset form when switching between create/edit (initial changes)
  useEffect(() => {
    form.reset(initial ? dbToForm(initial) : DEFAULT_VALUES);
  }, [initial, form]);

  // Brand change clears model (cascade)
  const brand = form.watch("brand");
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — `brand` is the trigger (cascade reset), effect body only uses form.setValue.
  useEffect(() => {
    form.setValue("model", "");
  }, [brand, form]);

  async function onSubmit(values: WishlistFormValues): Promise<void> {
    // D-08: auto-name on submit if empty
    const finalName = values.name && values.name.length > 0 ? values.name : summarize(values);
    const payload = { ...values, name: finalName };

    // L7: useCreateWishlist is NOT optimistic — mutateAsync resolves after the Supabase roundtrip.
    // The sequence is: user clicks "Salvar wishlist" → button shows spinner + disabled → mutation awaits → toast.success + sheet.close fire on resolution. The ~200-500ms gap before the grid refetch shows the new card is acceptable per RESEARCH.md §Landmine L7.
    try {
      if (isEdit && initial) {
        const updated = await updateMut.mutateAsync({ id: initial.id, patch: payload });
        toast.success("Wishlist atualizada");
        await onSaved?.(updated);
      } else {
        const created = await createMut.mutateAsync(payload);
        toast.success(`Wishlist "${finalName}" criada`, {
          description: summarize(payload),
        });
        await onSaved?.(created);
      }
      if (layout === "sheet") onOpenChange?.(false);
      form.reset(DEFAULT_VALUES);
    } catch (_err) {
      toast.error("Não foi possível salvar a wishlist. Verifique sua conexão e tente de novo.");
      // sheet stays open per UI-SPEC
    }
  }

  const handleCancel = useCallback(() => {
    onOpenChange?.(false);
    form.reset(initial ? dbToForm(initial) : DEFAULT_VALUES);
  }, [onOpenChange, form, initial]);

  // HUMAN-UAT Test 2 fix (Phase 7-13):
  //   - Snapshot the previously-focused element on open, restore it on close.
  //     Works for both desktop <aside> and mobile Radix Dialog branches without
  //     requiring callers to pass a triggerRef.
  //   - Listen for Escape on document and call handleCancel() — desktop only,
  //     because Radix Dialog (mobile branch) already handles Escape natively.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    return () => {
      const el = previouslyFocusedRef.current;
      if (el && typeof el.focus === "function") {
        // Defer to next tick so the close animation/unmount completes before
        // refocus — otherwise the browser may race and steal focus back to body.
        queueMicrotask(() => el.focus());
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open || !isDesktop) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, isDesktop, handleCancel]);

  if (layout === "sheet" && !open) return null;

  const submitting = form.formState.isSubmitting || createMut.isPending || updateMut.isPending;

  // The body — reused across all three layout variants
  const body = (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {/* Section: Qual carro você quer? */}
          <section className="space-y-4">
            <h3 className="font-semibold text-slate-900 text-lg dark:text-slate-100">
              Qual carro você quer?
            </h3>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da wishlist</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Honda Civic 2018+ SP"
                      className="h-11 bg-white dark:bg-slate-950"
                    />
                  </FormControl>
                  <FormDescription>opcional — geramos automaticamente</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="brand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Marca</FormLabel>
                  <FormControl>
                    <FipeBrandCombobox value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modelo</FormLabel>
                  <FormControl>
                    <FipeModelCombobox
                      brand={form.watch("brand")}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="trim"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Versão</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value || null)}
                      placeholder="EXL"
                      className="h-11 bg-white dark:bg-slate-950"
                    />
                  </FormControl>
                  <FormDescription>opcional — EXL, Touring, Sport...</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </section>

          {/* Section: Faixas aceitas */}
          <section className="space-y-4">
            <h3 className="font-semibold text-slate-900 text-lg dark:text-slate-100">
              Faixas aceitas
            </h3>
            <FormField
              control={form.control}
              name="year_min"
              render={() => (
                <FormItem>
                  <FormControl>
                    <YearRangeField
                      valueMin={form.watch("year_min")}
                      valueMax={form.watch("year_max")}
                      onChangeMin={(v) => form.setValue("year_min", v, { shouldValidate: true })}
                      onChangeMax={(v) => form.setValue("year_max", v, { shouldValidate: true })}
                      errorText={form.formState.errors.year_min?.message}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="km_max"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>KM máximo</FormLabel>
                  <FormControl>
                    <KmInput value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormDescription>Deixe vazio para qualquer quilometragem</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="price_max"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preço máximo</FormLabel>
                  <FormControl>
                    <BrlCurrencyInput value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormDescription>Teto que você aceita pagar</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </section>

          {/* Section: Combustível e câmbio */}
          <section className="space-y-4">
            <h3 className="font-semibold text-slate-900 text-lg dark:text-slate-100">
              Combustível e câmbio
            </h3>
            <div>
              <Label>Combustível</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {FUEL_OPTIONS.map((f) => {
                  const current = form.watch("fuel_type");
                  const selected = current.includes(f);
                  return (
                    <ChoiceChip
                      key={f}
                      selected={selected}
                      onClick={() => {
                        const next = selected ? current.filter((x) => x !== f) : [...current, f];
                        form.setValue("fuel_type", next, { shouldValidate: true });
                      }}
                    >
                      {f}
                    </ChoiceChip>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>Câmbio</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {TRANSMISSION_OPTIONS.map((t) => {
                  const current = form.watch("transmission");
                  const selected = current.includes(t);
                  return (
                    <ChoiceChip
                      key={t}
                      selected={selected}
                      onClick={() => {
                        const next = selected ? current.filter((x) => x !== t) : [...current, t];
                        form.setValue("transmission", next, { shouldValidate: true });
                      }}
                    >
                      {t}
                    </ChoiceChip>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Section: Blindagem e região */}
          <section className="space-y-4">
            <h3 className="font-semibold text-slate-900 text-lg dark:text-slate-100">
              Blindagem e região
            </h3>
            <div>
              <Label>Blindagem</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    { v: null, label: "Tanto faz" },
                    { v: true, label: "Só blindado" },
                    { v: false, label: "Excluir blindado" },
                  ] as const
                ).map((o) => {
                  const current = form.watch("armored");
                  const selected = current === o.v;
                  return (
                    <ChoiceChip
                      key={o.label}
                      selected={selected}
                      onClick={() => form.setValue("armored", o.v, { shouldValidate: true })}
                    >
                      {o.label}
                    </ChoiceChip>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>Regiões aceitas</Label>
              <p className="mt-1 text-slate-500 text-xs dark:text-slate-400">
                Deixe vazio para aceitar qualquer região
              </p>
              <div className="mt-2">
                <LocalidadeMultiPicker />
              </div>
            </div>
          </section>

          {/* Preview pane */}
          <WishlistPreviewPane control={form.control} />
        </div>

        <footer className="flex items-center justify-between gap-3 border-slate-200 border-t bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/50">
          {layout === "sheet" ? (
            <Button type="button" variant="ghost" onClick={handleCancel}>
              Cancelar
            </Button>
          ) : (
            <div />
          )}
          <Button
            type="submit"
            disabled={submitting}
            className="bg-[#4C46DC] text-white hover:bg-[#3f39c1]"
          >
            {submitting ? "Salvando..." : (submitLabel ?? "Salvar wishlist")}
          </Button>
        </footer>
      </form>
    </Form>
  );

  // Inline layout (onboarding step 3) — render body flat
  if (layout === "inline") {
    return <div className="flex flex-col">{body}</div>;
  }

  // Sheet layout: desktop aside OR mobile Dialog — never both. We JSX-gate the
  // entire subtree because Radix DialogContent portals to document.body and
  // escapes any CSS-only `md:hidden` wrapper (HIGH-01).
  if (isDesktop) {
    return (
      <>
        {/* Backdrop */}
        <button
          type="button"
          aria-label="Fechar"
          onClick={handleCancel}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
        />
        {/* biome-ignore lint/a11y/useSemanticElements: <dialog> element requires imperative .showModal()/.close() control, breaking our declarative `open` prop pattern. <aside> with role=dialog + aria-modal preserves the side-panel layout semantics while still being announced correctly by AT. */}
        <aside
          role="dialog"
          aria-modal="true"
          aria-labelledby="wishlist-form-sheet-title"
          className="fixed inset-y-0 right-0 z-50 flex w-[560px] flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-950"
        >
          <header className="flex items-center justify-between border-slate-200 border-b px-6 py-4 dark:border-slate-800">
            <h2
              id="wishlist-form-sheet-title"
              className="font-semibold text-lg text-slate-900 dark:text-slate-100"
            >
              {isEdit ? "Editar wishlist" : "Nova wishlist"}
            </h2>
            <Button variant="ghost" size="sm" onClick={handleCancel} aria-label="Fechar">
              <X className="size-4" />
            </Button>
          </header>
          {body}
        </aside>
      </>
    );
  }

  // Mobile — full-screen Dialog (< md)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-full w-full flex-col p-0 sm:max-w-none">
        <DialogHeader className="border-slate-200 border-b px-6 py-4 dark:border-slate-800">
          <DialogTitle>{isEdit ? "Editar wishlist" : "Nova wishlist"}</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
