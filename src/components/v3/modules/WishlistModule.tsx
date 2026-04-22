"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type LocalWishlist, type WishlistInput, useAppStore } from "@/lib/stores/app";
import type { FuelType, Transmission } from "@/types/database";
import {
  Car,
  Gauge,
  MapPin,
  Pause,
  Play,
  Plus,
  Settings2,
  Shield,
  Target,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

// ─── constants ──────────────────────────────────────────────────────────────

const FUEL_OPTIONS: { value: FuelType; label: string }[] = [
  { value: "flex", label: "Flex" },
  { value: "gasolina", label: "Gasolina" },
  { value: "diesel", label: "Diesel" },
  { value: "híbrido", label: "Híbrido" },
  { value: "elétrico", label: "Elétrico" },
];

const TRANSMISSION_OPTIONS: { value: Transmission; label: string }[] = [
  { value: "automático", label: "Automático" },
  { value: "CVT", label: "CVT" },
  { value: "manual", label: "Manual" },
];

const UF_OPTIONS = ["SP", "RJ", "MG", "RS", "PR", "SC", "BA", "GO", "DF", "PE", "CE", "ES"];

const CURRENT_YEAR = 2026;

function makeEmptyInput(): WishlistInput {
  return {
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
}

function wishlistToInput(w: LocalWishlist): WishlistInput {
  return {
    name: w.name,
    brand: w.brand,
    model: w.model,
    trim: w.trim,
    year_min: w.year_min,
    year_max: w.year_max,
    km_max: w.km_max,
    price_max: w.price_max,
    fuel_type: w.fuel_type,
    transmission: w.transmission,
    armored: w.armored,
    region_uf: w.region_uf,
    region_cities: w.region_cities,
    status: w.status,
  };
}

function formatBrl(v: number | null): string {
  if (v == null) return "—";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function summarize(w: LocalWishlist): string {
  const parts: string[] = [];
  const years =
    w.year_min && w.year_max
      ? `${w.year_min}-${w.year_max}`
      : w.year_min
        ? `${w.year_min}+`
        : w.year_max
          ? `até ${w.year_max}`
          : "qualquer ano";
  parts.push(years);
  if (w.km_max != null) parts.push(`até ${w.km_max.toLocaleString("pt-BR")} km`);
  if (w.price_max != null) parts.push(`até ${formatBrl(w.price_max)}`);
  if (w.region_uf.length > 0) parts.push(w.region_uf.join("/"));
  return parts.join(" · ");
}

// ─── main module ────────────────────────────────────────────────────────────

export default function WishlistModule(): React.JSX.Element {
  const wishlists = useAppStore((s) => s.wishlists);
  const createWishlist = useAppStore((s) => s.createWishlist);
  const updateWishlist = useAppStore((s) => s.updateWishlist);
  const toggleWishlistStatus = useAppStore((s) => s.toggleWishlistStatus);
  const deleteWishlist = useAppStore((s) => s.deleteWishlist);

  const [editing, setEditing] = useState<{ mode: "new" } | { mode: "edit"; id: string } | null>(
    null,
  );

  const sortedLists = useMemo(
    () =>
      [...wishlists].sort((a, b) => {
        if (a.status !== b.status) {
          if (a.status === "active") return -1;
          if (b.status === "active") return 1;
        }
        return b.updated_at.localeCompare(a.updated_at);
      }),
    [wishlists],
  );

  const editingWishlist =
    editing && editing.mode === "edit"
      ? (wishlists.find((w) => w.id === editing.id) ?? null)
      : null;

  const handleSave = (input: WishlistInput): void => {
    if (!editing) return;
    if (editing.mode === "new") {
      const created = createWishlist(input);
      toast.success(`Wishlist "${created.name}" criada`, {
        description: summarize(created),
      });
    } else {
      updateWishlist(editing.id, input);
      toast.success("Wishlist atualizada");
    }
    setEditing(null);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-semibold text-2xl text-slate-900 tracking-tight dark:text-slate-100 md:text-3xl">
            Minhas Wishlists
          </h1>
          <p className="mt-1 max-w-2xl text-slate-600 text-sm dark:text-slate-300">
            Cadastre os carros que você quer. O agente monitora o WebMotors 24/7, negocia com o
            vendedor e entrega as oportunidades prontas no seu marketplace.
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => setEditing({ mode: "new" })}
          className="bg-[#4C46DC] text-white hover:bg-[#3f39c1]"
        >
          <Plus className="mr-2 size-4" />
          Nova Wishlist
        </Button>
      </header>

      {sortedLists.length === 0 ? (
        <EmptyState onCreate={() => setEditing({ mode: "new" })} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedLists.map((wl) => (
            <WishlistCard
              key={wl.id}
              wishlist={wl}
              onEdit={() => setEditing({ mode: "edit", id: wl.id })}
              onToggle={() => toggleWishlistStatus(wl.id)}
              onDelete={() => {
                if (confirm(`Apagar wishlist "${wl.name}"?`)) {
                  deleteWishlist(wl.id);
                  toast.success("Wishlist removida");
                }
              }}
            />
          ))}
        </div>
      )}

      {editing !== null && (
        <WishlistFormDrawer
          initial={editingWishlist ? wishlistToInput(editingWishlist) : makeEmptyInput()}
          title={editing.mode === "new" ? "Nova Wishlist" : "Editar Wishlist"}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ─── empty state ────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 border-dashed bg-white/50 px-6 py-20 text-center dark:border-slate-800 dark:bg-slate-900/40">
      <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-[#4C46DC]/10 text-[#4C46DC] dark:bg-[#4C46DC]/20">
        <Target className="size-7" />
      </div>
      <h2 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
        Sem wishlists ainda
      </h2>
      <p className="mt-2 max-w-md text-slate-600 text-sm dark:text-slate-300">
        Cadastre o primeiro carro que você quer. Quanto mais específico melhor — marca, modelo, ano,
        km, faixa de preço, região. O agente cuida do resto.
      </p>
      <Button
        size="lg"
        onClick={onCreate}
        className="mt-6 bg-[#4C46DC] text-white hover:bg-[#3f39c1]"
      >
        <Plus className="mr-2 size-4" />
        Criar primeira wishlist
      </Button>
    </div>
  );
}

// ─── wishlist card ──────────────────────────────────────────────────────────

interface WishlistCardProps {
  wishlist: LocalWishlist;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

function WishlistCard({
  wishlist,
  onEdit,
  onToggle,
  onDelete,
}: WishlistCardProps): React.JSX.Element {
  const isActive = wishlist.status === "active";
  return (
    <article
      className={`group relative flex flex-col gap-4 rounded-2xl border bg-white p-5 transition-shadow hover:shadow-md dark:bg-slate-900/60 ${
        isActive
          ? "border-slate-200 dark:border-slate-800"
          : "border-slate-200 border-dashed opacity-70 dark:border-slate-800"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-slate-900 dark:text-slate-100">
            {wishlist.name || `${wishlist.brand} ${wishlist.model}`}
          </h3>
          <p className="mt-1 truncate text-slate-600 text-sm dark:text-slate-300">
            {wishlist.brand} {wishlist.model} {wishlist.trim ?? ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-medium text-[11px] uppercase tracking-wide ring-1 ${
            isActive
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900"
              : "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900"
          }`}
        >
          {isActive ? "Ativa" : "Pausada"}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <Row icon={<Car className="size-3.5" />} label="Ano">
          {wishlist.year_min && wishlist.year_max
            ? `${wishlist.year_min}-${wishlist.year_max}`
            : wishlist.year_min
              ? `${wishlist.year_min}+`
              : wishlist.year_max
                ? `até ${wishlist.year_max}`
                : "qualquer"}
        </Row>
        <Row icon={<Gauge className="size-3.5" />} label="KM máx">
          {wishlist.km_max != null ? `${wishlist.km_max.toLocaleString("pt-BR")} km` : "—"}
        </Row>
        <Row icon={<Wallet className="size-3.5" />} label="Preço máx">
          {formatBrl(wishlist.price_max)}
        </Row>
        <Row icon={<MapPin className="size-3.5" />} label="Região">
          {wishlist.region_uf.length > 0 ? wishlist.region_uf.join(", ") : "qualquer"}
        </Row>
      </dl>

      {wishlist.fuel_type.length > 0 || wishlist.transmission.length > 0 || wishlist.armored ? (
        <div className="flex flex-wrap gap-1.5 border-slate-100 border-t pt-3 dark:border-slate-800">
          {wishlist.fuel_type.map((f) => (
            <Chip key={f}>{f}</Chip>
          ))}
          {wishlist.transmission.map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
          {wishlist.armored === true && <Chip tone="warn">Só blindado</Chip>}
          {wishlist.armored === false && <Chip>Não blindado</Chip>}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between border-slate-100 border-t pt-3 dark:border-slate-800">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Settings2 className="mr-1.5 size-3.5" />
          Editar
        </Button>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onToggle}>
            {isActive ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </article>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <>
      <dt className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </dt>
      <dd className="font-medium text-slate-900 dark:text-slate-100">{children}</dd>
    </>
  );
}

function Chip({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "warn";
}): React.JSX.Element {
  const styles =
    tone === "warn"
      ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900"
      : "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700";
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[11px] capitalize ring-1 ring-inset ${styles}`}>
      {children}
    </span>
  );
}

// ─── form drawer ────────────────────────────────────────────────────────────

interface WishlistFormDrawerProps {
  initial: WishlistInput;
  title: string;
  onSave: (input: WishlistInput) => void;
  onCancel: () => void;
}

function WishlistFormDrawer({
  initial,
  title,
  onSave,
  onCancel,
}: WishlistFormDrawerProps): React.JSX.Element {
  const [form, setForm] = useState<WishlistInput>(initial);
  const [touched, setTouched] = useState(false);

  const errors = useMemo(() => validate(form), [form]);
  const isValid = Object.keys(errors).length === 0;

  const handleSubmit = (): void => {
    setTouched(true);
    if (!isValid) return;
    // Auto-derive name if empty
    const final = { ...form };
    if (!final.name.trim()) {
      final.name = `${form.brand} ${form.model}${form.trim ? ` ${form.trim}` : ""}`.trim();
    }
    onSave(final);
  };

  const toggleArrayItem = <T extends string>(
    arr: T[],
    item: T,
    setter: (next: T[]) => void,
  ): void => {
    if (arr.includes(item)) {
      setter(arr.filter((x) => x !== item));
    } else {
      setter([...arr, item]);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Fechar"
        onClick={onCancel}
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-950 md:w-[560px]">
        <header className="flex items-center justify-between border-slate-200 border-b px-6 py-4 dark:border-slate-800">
          <h2 className="font-semibold text-lg text-slate-900 dark:text-slate-100">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="size-4" />
          </Button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {/* Identification */}
          <section className="space-y-4">
            <Field
              label="Nome da wishlist"
              htmlFor="wl-name"
              hint="(opcional — geramos automaticamente)"
            >
              <Input
                id="wl-name"
                placeholder="Ex: Honda Civic 2018+ SP"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field
                label="Marca"
                htmlFor="wl-brand"
                required
                error={touched ? errors.brand : null}
              >
                <Input
                  id="wl-brand"
                  placeholder="Honda"
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                />
              </Field>
              <Field
                label="Modelo"
                htmlFor="wl-model"
                required
                error={touched ? errors.model : null}
              >
                <Input
                  id="wl-model"
                  placeholder="Civic"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Versão (opcional)" htmlFor="wl-trim">
              <Input
                id="wl-trim"
                placeholder="EXL, Touring..."
                value={form.trim ?? ""}
                onChange={(e) => setForm({ ...form, trim: e.target.value || null })}
              />
            </Field>
          </section>

          {/* Year + KM + Price */}
          <section className="space-y-4">
            <h3 className="font-medium text-slate-700 text-sm dark:text-slate-300">
              Faixas aceitas
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ano mínimo" htmlFor="wl-ymin">
                <Input
                  id="wl-ymin"
                  type="number"
                  min={1990}
                  max={CURRENT_YEAR}
                  placeholder="2018"
                  value={form.year_min ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, year_min: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </Field>
              <Field label="Ano máximo" htmlFor="wl-ymax">
                <Input
                  id="wl-ymax"
                  type="number"
                  min={1990}
                  max={CURRENT_YEAR}
                  placeholder={String(CURRENT_YEAR)}
                  value={form.year_max ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, year_max: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="KM máximo" htmlFor="wl-km">
                <Input
                  id="wl-km"
                  type="number"
                  min={0}
                  placeholder="80000"
                  value={form.km_max ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, km_max: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </Field>
              <Field label="Preço máximo (R$)" htmlFor="wl-price">
                <Input
                  id="wl-price"
                  type="number"
                  min={0}
                  placeholder="130000"
                  value={form.price_max ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, price_max: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </Field>
            </div>
          </section>

          {/* Fuel + Transmission */}
          <section className="space-y-3">
            <h3 className="font-medium text-slate-700 text-sm dark:text-slate-300">
              Combustível + câmbio
            </h3>
            <div className="space-y-2">
              <Label className="text-slate-600 text-xs dark:text-slate-400">Combustível</Label>
              <div className="flex flex-wrap gap-2">
                {FUEL_OPTIONS.map(({ value, label }) => (
                  <ChoiceChip
                    key={value}
                    selected={form.fuel_type.includes(value)}
                    onClick={() =>
                      toggleArrayItem(form.fuel_type, value, (next) =>
                        setForm({ ...form, fuel_type: next }),
                      )
                    }
                  >
                    {label}
                  </ChoiceChip>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-600 text-xs dark:text-slate-400">Câmbio</Label>
              <div className="flex flex-wrap gap-2">
                {TRANSMISSION_OPTIONS.map(({ value, label }) => (
                  <ChoiceChip
                    key={value}
                    selected={form.transmission.includes(value)}
                    onClick={() =>
                      toggleArrayItem(form.transmission, value, (next) =>
                        setForm({ ...form, transmission: next }),
                      )
                    }
                  >
                    {label}
                  </ChoiceChip>
                ))}
              </div>
            </div>
          </section>

          {/* Armored */}
          <section className="space-y-2">
            <Label className="text-slate-600 text-xs dark:text-slate-400">
              <Shield className="mr-1 inline size-3.5" />
              Blindagem
            </Label>
            <div className="flex gap-2">
              <ChoiceChip
                selected={form.armored === null}
                onClick={() => setForm({ ...form, armored: null })}
              >
                Qualquer
              </ChoiceChip>
              <ChoiceChip
                selected={form.armored === true}
                onClick={() => setForm({ ...form, armored: true })}
              >
                Só blindado
              </ChoiceChip>
              <ChoiceChip
                selected={form.armored === false}
                onClick={() => setForm({ ...form, armored: false })}
              >
                Não blindado
              </ChoiceChip>
            </div>
          </section>

          {/* Region */}
          <section className="space-y-2">
            <Label className="text-slate-600 text-xs dark:text-slate-400">
              <MapPin className="mr-1 inline size-3.5" />
              UFs aceitas (vazio = qualquer)
            </Label>
            <div className="flex flex-wrap gap-2">
              {UF_OPTIONS.map((uf) => (
                <ChoiceChip
                  key={uf}
                  selected={form.region_uf.includes(uf)}
                  onClick={() =>
                    toggleArrayItem(form.region_uf, uf, (next) =>
                      setForm({ ...form, region_uf: next }),
                    )
                  }
                >
                  {uf}
                </ChoiceChip>
              ))}
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-between gap-3 border-slate-200 border-t bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/50">
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={touched && !isValid}
            className="bg-[#4C46DC] text-white hover:bg-[#3f39c1]"
          >
            Salvar wishlist
          </Button>
        </footer>
      </aside>
    </>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function validate(input: WishlistInput): Partial<Record<string, string>> {
  const e: Partial<Record<string, string>> = {};
  if (!input.brand.trim()) e.brand = "obrigatório";
  if (!input.model.trim()) e.model = "obrigatório";
  if (input.year_min != null && input.year_max != null && input.year_min > input.year_max) {
    e.year_min = "mínimo > máximo";
  }
  return e;
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-slate-700 text-sm dark:text-slate-200">
        {label}
        {required && <span className="text-red-500">*</span>}
        {hint && (
          <span className="ml-2 font-normal text-slate-500 text-xs dark:text-slate-400">
            {hint}
          </span>
        )}
      </Label>
      {children}
      {error && <p className="text-red-600 text-xs dark:text-red-400">{error}</p>}
    </div>
  );
}

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
      className={`rounded-full px-3 py-1 font-medium text-xs ring-1 transition ${
        selected
          ? "bg-[#4C46DC] text-white ring-[#4C46DC]"
          : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}
