"use client";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { type Listing, listingSchema } from "@/lib/schemas/listing";
import { useNegotiationStore } from "@/lib/stores/negotiation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useShallow } from "zustand/react/shallow";
import { useFipeLookup } from "./useFipeLookup";

interface Props {
  disabled?: boolean;
  onReady: () => void; // user clicked "Iniciar"; page starts negotiating
}

const defaultValues: Listing = {
  marca: "",
  modelo: "",
  ano: 0,
  km: 0,
  precoPedido: 0,
  cidade: "",
  diasOnline: 0,
  reducoes: 0,
};

export function AdListingForm({ disabled, onReady }: Props) {
  const form = useForm<Listing>({
    resolver: zodResolver(listingSchema),
    defaultValues,
    mode: "onBlur",
  });

  // 3 slices → treat as one atomic object → useShallow (Pattern B from <guidance>).
  const { initSession, setFipe, currentSession } = useNegotiationStore(
    useShallow((s) => ({
      initSession: s.initSession,
      setFipe: s.setFipe,
      currentSession: s.currentSession,
    })),
  );

  const fipeLookup = useFipeLookup();

  // Auto-fetch FIPE whenever marca+modelo+ano all present and fipe not manually edited.
  const marca = form.watch("marca");
  const modelo = form.watch("modelo");
  const ano = form.watch("ano");

  // biome-ignore lint/correctness/useExhaustiveDependencies: fipeLookup.lookup is stable (useCallback [])
  useEffect(() => {
    if (marca && modelo && ano && !currentSession?.fipe) {
      fipeLookup.lookup({ marca, modelo, ano: Number(ano) });
    }
  }, [marca, modelo, ano, currentSession?.fipe]);

  // When FIPE auto-fetch lands, seed the store; this triggers targetPrice/walkAwayPrice derivation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: form + initSession are stable references
  useEffect(() => {
    if (fipeLookup.status === "success" && fipeLookup.fipe) {
      const listing = form.getValues();
      initSession(listing, fipeLookup.fipe);
    }
  }, [fipeLookup.status, fipeLookup.fipe]);

  function onManualFipeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = Number(e.target.value);
    if (!Number.isFinite(n) || n <= 0) return;
    if (!currentSession) {
      const listing = form.getValues();
      if (listingSchema.safeParse(listing).success) {
        initSession(listing, Math.round(n));
      }
      return;
    }
    setFipe(Math.round(n));
  }

  function onSubmit(data: Listing) {
    // Require FIPE resolved before proceeding.
    const s = useNegotiationStore.getState().currentSession;
    if (!s?.fipe || s.fipe <= 0) {
      form.setError("root", {
        message: "Defina a FIPE (automática ou manual) antes de iniciar",
      });
      return;
    }
    // Make sure the session's listing matches current form values.
    initSession(data, s.fipe);
    onReady();
  }

  const currentFipe = currentSession?.fipe ?? 0;

  const fipeStatusMsg = useMemo(() => {
    switch (fipeLookup.status) {
      case "loading":
        return "Buscando FIPE...";
      case "success":
        return `FIPE encontrada: R$ ${fipeLookup.fipe?.toLocaleString("pt-BR")}`;
      case "not_found":
        return "Não encontrada automaticamente — use o campo manual abaixo.";
      case "upstream_failed":
        return "Serviço FIPE indisponível — use o campo manual abaixo.";
      case "error":
        return "Erro ao consultar FIPE — use o campo manual abaixo.";
      default:
        return "";
    }
  }, [fipeLookup.status, fipeLookup.fipe]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="marca"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Marca</FormLabel>
              <FormControl>
                <Input {...field} disabled={disabled} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="modelo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Modelo</FormLabel>
              <FormControl>
                <Input {...field} disabled={disabled} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="ano"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ano</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    disabled={disabled}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="km"
            render={({ field }) => (
              <FormItem>
                <FormLabel>KM</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    disabled={disabled}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="precoPedido"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Preço pedido (R$)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  {...field}
                  disabled={disabled}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cidade"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cidade</FormLabel>
              <FormControl>
                <Input {...field} disabled={disabled} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="diasOnline"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Dias online</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    disabled={disabled}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="reducoes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reduções</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    disabled={disabled}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* FIPE auto status + manual fallback (FIPE-01 + FIPE-02) */}
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-medium">FIPE</div>
          {fipeLookup.status === "loading" ? <Skeleton className="h-5 w-40" /> : null}
          {fipeStatusMsg && fipeLookup.status !== "loading" ? (
            <div className="text-xs text-slate-600">{fipeStatusMsg}</div>
          ) : null}
          <label className="mt-2 block text-xs text-slate-500" htmlFor="manual-fipe-input">
            Se a busca automática falhar, insira a FIPE manualmente (R$):
          </label>
          <Input
            id="manual-fipe-input"
            type="number"
            placeholder="Ex: 52000"
            defaultValue={currentFipe || ""}
            onChange={onManualFipeChange}
            disabled={disabled}
          />
          {currentFipe > 0 ? (
            <div className="text-xs text-slate-500">
              Preço-alvo: R$ {Math.round(currentFipe * 0.75).toLocaleString("pt-BR")} (25% abaixo da
              FIPE)
            </div>
          ) : null}
        </div>

        {form.formState.errors.root?.message ? (
          <div className="text-sm text-red-600">{form.formState.errors.root.message}</div>
        ) : null}

        <Button type="submit" disabled={disabled} className="w-full">
          Iniciar negociação
        </Button>
      </form>
    </Form>
  );
}
