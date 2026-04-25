"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateWishlist,
  useDeleteWishlist,
  useUpdateWishlist,
  useWishlists,
} from "@/lib/supabase/hooks/useWishlists";
import { summarize } from "@/lib/wishlist/summarize";
import type { DbWishlist } from "@/types/database";
import {
  Car,
  Gauge,
  MapPin,
  Pause,
  Play,
  Plus,
  Settings2,
  Target,
  Trash2,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { WishlistFormSheet } from "./WishlistFormSheet";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatBrl(v: number | null): string {
  if (v == null) return "—";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ─── main module ────────────────────────────────────────────────────────────

export function WishlistModule(): React.JSX.Element {
  const { data: wishlists = [], isLoading, isError } = useWishlists();
  const _createMut = useCreateWishlist(); // referenced for hook count + future inline create paths
  const updateMut = useUpdateWishlist();
  const deleteMut = useDeleteWishlist();

  const [formState, setFormState] = useState<
    { mode: "create"; initial?: undefined } | { mode: "edit"; initial: DbWishlist } | null
  >(null);
  const [deleting, setDeleting] = useState<DbWishlist | null>(null);

  const sortedLists = useMemo(
    () =>
      [...wishlists].sort((a, b) => {
        // Paused cards to bottom (D-15 visual hierarchy from scaffold)
        if (a.status === "paused" && b.status !== "paused") return 1;
        if (a.status !== "paused" && b.status === "paused") return -1;
        return b.updated_at.localeCompare(a.updated_at);
      }),
    [wishlists],
  );

  const togglePause = (w: DbWishlist) => {
    const nextStatus = w.status === "paused" ? "active" : "paused";
    updateMut.mutate(
      { id: w.id, patch: { status: nextStatus } },
      {
        onSuccess: () =>
          toast.success(
            nextStatus === "paused"
              ? "Wishlist pausada. O sistema não criará novas oportunidades até retomar."
              : "Wishlist ativa de novo.",
          ),
      },
    );
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-semibold text-2xl text-slate-900 tracking-tight dark:text-slate-100 md:text-3xl">
            Minhas Wishlists
          </h1>
          <p className="mt-1 max-w-2xl text-slate-600 text-sm dark:text-slate-300">
            Cadastre os carros que você quer comprar. O sistema monitora o WebMotors e entrega
            oportunidades compatíveis.
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => setFormState({ mode: "create" })}
          className="bg-[#4C46DC] text-white hover:bg-[#3f39c1]"
        >
          <Plus className="mr-2 size-4" />+ Nova Wishlist
        </Button>
      </header>

      {isError ? (
        <ErrorCard />
      ) : isLoading ? (
        <LoadingGrid />
      ) : sortedLists.length === 0 ? (
        <EmptyState onCreate={() => setFormState({ mode: "create" })} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedLists.map((wl) => (
            <WishlistCard
              key={wl.id}
              wishlist={wl}
              onEdit={() => setFormState({ mode: "edit", initial: wl })}
              onToggle={() => togglePause(wl)}
              onDelete={() => setDeleting(wl)}
            />
          ))}
        </div>
      )}

      {formState !== null && (
        <WishlistFormSheet
          initial={formState.mode === "edit" ? formState.initial : null}
          open
          onOpenChange={(o) => {
            if (!o) setFormState(null);
          }}
          onSaved={() => setFormState(null)}
        />
      )}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar wishlist?</AlertDialogTitle>
            <AlertDialogDescription>
              A wishlist "{deleting?.name}" será removida. Oportunidades já abertas continuam no
              marketplace, mas nenhuma nova será criada. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel autoFocus>Manter</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleting) return;
                deleteMut.mutate(deleting.id, {
                  onSuccess: () => toast.success("Wishlist removida."),
                });
                setDeleting(null);
              }}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Default export retained for AppShell module registry compatibility.
export default WishlistModule;

// ─── states ─────────────────────────────────────────────────────────────────

function LoadingGrid(): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="flex flex-col gap-4 p-5">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function ErrorCard(): React.JSX.Element {
  return (
    <Card className="flex items-center gap-3 border-red-200 bg-red-50/50 p-6 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
      <p className="text-sm">
        Não carregou suas wishlists. Recarregue a página ou tente em alguns minutos.
      </p>
    </Card>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 border-dashed bg-white/50 px-6 py-20 text-center dark:border-slate-800 dark:bg-slate-900/40">
      <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-[#4C46DC]/10 text-[#4C46DC] dark:bg-[#4C46DC]/20">
        <Target className="size-7" />
      </div>
      <h2 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
        Ainda sem wishlists
      </h2>
      <p className="mt-2 max-w-md text-slate-600 text-sm dark:text-slate-300">
        Descreva o primeiro carro que você quer comprar. Marca, modelo, ano, km, preço, região —
        quanto mais específico, melhor.
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
  wishlist: DbWishlist;
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
            {wishlist.name || summarize(wishlist)}
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
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            aria-label={isActive ? "Pausar" : "Retomar"}
          >
            {isActive ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            aria-label="Apagar"
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
