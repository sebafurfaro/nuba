"use client";

import { Button, Input, Text } from "@heroui/react";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

export interface CartItem {
  product_id: string;
  variant_id?: string;
  name: string;
  unit_price: number;
  quantity: number;
  notes?: string;
}

export interface ProductSelectorProps {
  tenantId: string;
  onCartChange: (items: CartItem[]) => void;
}

/** Volcado síncrono de la comanda interna (p. ej. al crear la orden sin pulsar «Agregar a la orden»). */
export type ProductSelectorHandle = {
  consumePendingCart: () => CartItem[];
};

type CategoryOption = { id: string; name: string };

type ProductForSelector = {
  id: string;
  name: string;
  price: number;
  discount_price: number | null;
  image_url: string | null;
  category_id: string | null;
  variants: { id: string; name: string; price: number }[];
  stock: number;
  track_stock: boolean;
};

const ALL = "__all__" as const;
const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function effectiveUnitPrice(p: ProductForSelector): number {
  return p.discount_price != null ? p.discount_price : p.price;
}

function lineKey(p: CartItem): string {
  return `${p.product_id}:${p.variant_id ?? ""}`;
}

export const ProductSelector = forwardRef<
  ProductSelectorHandle,
  ProductSelectorProps
>(function ProductSelector({ tenantId, onCartChange }, ref) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [rawProducts, setRawProducts] = useState<ProductForSelector[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string>(ALL);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [internalCart, setInternalCart] = useState<CartItem[]>([]);
  const internalCartRef = useRef<CartItem[]>([]);
  const [popover, setPopover] = useState<{ productId: string } | null>(null);
  const [popoverVariants, setPopoverVariants] = useState<
    { id: string; name: string; price: number }[]
  >([]);
  const [popoverLoading, setPopoverLoading] = useState(false);
  const variantCache = useRef(
    new Map<string, { id: string; name: string; price: number }[]>(),
  );
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    internalCartRef.current = internalCart;
  }, [internalCart]);

  useImperativeHandle(
    ref,
    () => ({
      consumePendingCart: () => {
        const copy = internalCartRef.current.map((c) => ({ ...c }));
        setInternalCart([]);
        internalCartRef.current = [];
        setSheetOpen(false);
        setPopover(null);
        return copy;
      },
    }),
    [],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 200);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/${tenantId}/productos`, {
        credentials: "include",
      });
      const j = (await res.json()) as {
        products?: Array<{
          id: string;
          name: string;
          price: number;
          discount_price: number | null;
          image_url: string | null;
          category_id: string | null;
          stock: number;
          track_stock: boolean;
          is_active: boolean;
        }>;
        categories?: CategoryOption[];
      };
      if (!res.ok) {
        throw new Error("fetch");
      }
      const list = (j.products ?? [])
        .filter(
          (p) =>
            p.is_active &&
            (!p.track_stock || p.stock > 0),
        )
        .map(
          (p): ProductForSelector => ({
            id: p.id,
            name: p.name,
            price: p.price,
            discount_price: p.discount_price,
            image_url: p.image_url,
            category_id: p.category_id,
            variants: [],
            stock: p.stock,
            track_stock: p.track_stock,
          }),
        );
      setRawProducts(list);
      setCategories(j.categories ?? []);
    } catch {
      setError(true);
      setRawProducts([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (debouncedSearch.length > 0) {
      setActiveCategoryId(ALL);
    }
  }, [debouncedSearch]);

  const filteredProducts = useMemo(() => {
    let list = rawProducts;
    if (debouncedSearch.length > 0) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    } else if (activeCategoryId !== ALL) {
      list = list.filter((p) => p.category_id === activeCategoryId);
    }
    return list;
  }, [rawProducts, activeCategoryId, debouncedSearch]);

  const totalQtyProduct = useCallback(
    (productId: string) => {
      return internalCart
        .filter((c) => c.product_id === productId)
        .reduce((s, c) => s + c.quantity, 0);
    },
    [internalCart],
  );

  const cartTotal = useMemo(
    () =>
      internalCart.reduce((s, c) => s + c.unit_price * c.quantity, 0),
    [internalCart],
  );

  useEffect(() => {
    if (!popover) {
      return;
    }
    function onDoc(e: MouseEvent) {
      const el = popoverRef.current;
      if (el && !el.contains(e.target as Node)) {
        setPopover(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [popover]);

  const addUnit = useCallback(
    (
      p: ProductForSelector,
      opts?: { variantId: string; variantName: string; unitPrice: number },
    ) => {
      const variantId = opts?.variantId;
      const variantName = opts?.variantName;
      const unit =
        opts != null ? opts.unitPrice : effectiveUnitPrice(p);
      let label = p.name;
      if (variantId && variantName) {
        label = `${p.name} — ${variantName}`;
      }
      setInternalCart((prev) => {
        const idx = prev.findIndex(
          (c) =>
            c.product_id === p.id &&
            (variantId ? c.variant_id === variantId : !c.variant_id),
        );
        const totalForProduct = prev
          .filter((c) => c.product_id === p.id)
          .reduce((s, c) => s + c.quantity, 0);
        const maxQty = p.track_stock ? p.stock : Infinity;
        if (totalForProduct + 1 > maxQty) {
          return prev;
        }
        if (idx === -1) {
          return [
            ...prev,
            {
              product_id: p.id,
              variant_id: variantId,
              name: label,
              unit_price: unit,
              quantity: 1,
            },
          ];
        }
        const cur = prev[idx]!;
        const next = [...prev];
        next[idx] = { ...cur, quantity: cur.quantity + 1 };
        return next;
      });
      setPopover(null);
    },
    [],
  );

  const onProductCardClick = useCallback(
    async (p: ProductForSelector) => {
      let rows = variantCache.current.get(p.id);
      if (rows === undefined) {
        setPopover({ productId: p.id });
        setPopoverLoading(true);
        setPopoverVariants([]);
        try {
          const res = await fetch(`/api/${tenantId}/productos/${p.id}`, {
            credentials: "include",
          });
          const j = (await res.json()) as {
            variants?: Array<{
              id: string;
              name: string;
              price: number | null;
            }>;
          };
          rows = (j.variants ?? []).map((v) => ({
            id: v.id,
            name: v.name,
            price:
              v.price != null && Number.isFinite(v.price)
                ? v.price
                : effectiveUnitPrice(p),
          }));
        } catch {
          rows = [];
        }
        variantCache.current.set(p.id, rows);
        setPopoverVariants(rows);
        setPopoverLoading(false);
      } else {
        setPopoverVariants(rows);
        setPopoverLoading(false);
      }

      if (rows.length > 0) {
        setPopover({ productId: p.id });
        return;
      }
      setPopover(null);
      addUnit(p);
    },
    [tenantId, addUnit],
  );

  const bumpQty = useCallback(
    (key: string, delta: number) => {
      setInternalCart((prev) => {
        const idx = prev.findIndex((c) => lineKey(c) === key);
        if (idx === -1) {
          return prev;
        }
        const cur = prev[idx]!;
        const prod = rawProducts.find((r) => r.id === cur.product_id);
        const maxQty =
          prod && prod.track_stock ? prod.stock : Number.POSITIVE_INFINITY;
        const totalForProduct = prev
          .filter((c) => c.product_id === cur.product_id)
          .reduce((s, c) => s + c.quantity, 0);
        const nextQty = cur.quantity + delta;
        if (nextQty <= 0) {
          return prev.filter((_, i) => i !== idx);
        }
        if (delta > 0 && totalForProduct + delta > maxQty) {
          return prev;
        }
        const next = [...prev];
        next[idx] = { ...cur, quantity: nextQty };
        return next;
      });
    },
    [rawProducts],
  );

  const centerHeader =
    debouncedSearch.length > 0
      ? "Resultados de búsqueda"
      : activeCategoryId === ALL
        ? "Todos"
        : categories.find((c) => c.id === activeCategoryId)?.name ?? "Productos";

  const categoryList = (
    <>
      <Input
        variant="secondary"
        placeholder="Buscar productos…"
        value={searchInput}
        onChange={(e) => setSearchInput(e.currentTarget.value)}
        className="mb-2 shrink-0"
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <button
          type="button"
          onClick={() => {
            setActiveCategoryId(ALL);
            setSearchInput("");
            setDebouncedSearch("");
          }}
          className="mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-sm transition-colors"
          style={
            activeCategoryId === ALL && debouncedSearch.length === 0
              ? {
                  background: "var(--nuba-accent-soft)",
                  color: "var(--nuba-accent)",
                }
              : { color: "var(--foreground)" }
          }
        >
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: "var(--nuba-accent)" }}
            aria-hidden
          />
          Todos
        </button>
        {categories.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setActiveCategoryId(c.id);
              setSearchInput("");
              setDebouncedSearch("");
            }}
            className="mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-sm transition-colors"
            style={
              activeCategoryId === c.id
                ? {
                    background: "var(--nuba-accent-soft)",
                    color: "var(--nuba-accent)",
                  }
                : { color: "var(--foreground)" }
            }
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{
                background:
                  i % 2 === 0 ? "var(--nuba-accent)" : "var(--nuba-success)",
              }}
              aria-hidden
            />
            <span className="truncate">{c.name}</span>
          </button>
        ))}
      </div>
    </>
  );

  const productGrid = (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-[0.5px] border-border-subtle">
      <div
        className="shrink-0 border-b-[0.5px] border-border-subtle px-2 py-2"
        style={{ background: "var(--nuba-surface)" }}
      >
        <Text className="text-sm font-medium text-foreground">{centerHeader}</Text>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {loading ? (
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-[10px] border-[0.5px] border-border-subtle p-1.5"
                style={{ minHeight: 96 }}
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Text className="text-center text-sm text-foreground-secondary">
              No se pudieron cargar los productos
            </Text>
            <Button variant="secondary" size="sm" onPress={() => void load()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
            }}
          >
            {filteredProducts.map((p) => {
              const tq = totalQtyProduct(p.id);
              const hasQty = tq > 0;
              return (
                <div key={p.id} className="relative">
                  <button
                    type="button"
                    data-product-card
                    className="flex w-full flex-col items-center gap-1 rounded-[10px] border-[0.5px] p-1.5 text-center transition-colors"
                    style={{
                      borderColor: hasQty
                        ? "var(--color-success)"
                        : "var(--border-subtle)",
                      background: hasQty
                        ? "var(--color-success-soft)"
                        : "var(--nuba-surface)",
                    }}
                    onClick={() => void onProductCardClick(p)}
                  >
                    <div
                      className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border-[0.5px] border-border-subtle text-lg"
                      style={{ background: "var(--nuba-raised)" }}
                    >
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image_url}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="text-foreground-muted" aria-hidden>
                          {p.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span
                      className="line-clamp-2 w-full text-[11px] leading-tight text-foreground"
                      title={p.name}
                    >
                      {p.name}
                    </span>
                    <div className="flex flex-col items-center gap-0.5 text-[11px]">
                      {p.discount_price != null ? (
                        <>
                          <span
                            className="line-through"
                            style={{ color: "var(--foreground-muted)" }}
                          >
                            {money.format(p.price)}
                          </span>
                          <span style={{ color: "var(--accent)" }}>
                            {money.format(p.discount_price)}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: "var(--foreground)" }}>
                          {money.format(p.price)}
                        </span>
                      )}
                    </div>
                    {hasQty ? (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          background: "var(--color-success-soft)",
                          color: "var(--color-success)",
                        }}
                      >
                        {tq} agregado{tq === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </button>
                  {popover?.productId === p.id ? (
                    <div
                      ref={popoverRef}
                      className="absolute left-0 top-full z-50 mt-1 min-w-[9rem] max-w-[14rem] rounded-lg border-[0.5px] p-1 shadow-lg"
                      style={{
                        borderColor: "var(--border-subtle)",
                        background: "var(--nuba-surface)",
                        boxShadow:
                          "0 8px 24px color-mix(in srgb, var(--foreground) 14%, transparent)",
                      }}
                    >
                      {popoverLoading ? (
                        <Text className="px-2 py-2 text-xs text-foreground-muted">
                          Cargando…
                        </Text>
                      ) : (
                        <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                          {popoverVariants.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              className="rounded-md px-2 py-2 text-start text-xs transition-colors hover:bg-raised"
                              style={{ color: "var(--foreground)" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                addUnit(p, {
                                  variantId: v.id,
                                  variantName: v.name,
                                  unitPrice: v.price,
                                });
                              }}
                            >
                              <span className="font-medium">{v.name}</span>
                              <span
                                className="mt-0.5 block text-foreground-secondary"
                              >
                                {money.format(v.price)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const comandaColumn = (
    <div
      className="flex h-full min-h-0 w-[190px] shrink-0 flex-col overflow-hidden border-[0.5px] border-border-subtle"
      style={{ background: "var(--nuba-surface)" }}
    >
      <div className="shrink-0 border-b-[0.5px] border-border-subtle px-2 py-2">
        <Text className="text-sm font-medium text-foreground">Comanda</Text>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {internalCart.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
            <ShoppingCart
              className="size-8 shrink-0"
              style={{ color: "var(--foreground-muted)" }}
              aria-hidden
            />
            <Text className="text-xs text-foreground-secondary">
              Sin productos aún
            </Text>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {internalCart.map((c) => (
              <li
                key={lineKey(c)}
                className="rounded-lg border-[0.5px] border-border-subtle px-1.5 py-1.5"
              >
                <div
                  className="truncate text-xs font-medium text-foreground"
                  title={c.name}
                >
                  {c.name}
                </div>
                <div className="mt-1 flex items-center justify-between gap-1">
                  <button
                    type="button"
                    className="inline-flex size-7 min-h-[28px] min-w-[28px] shrink-0 items-center justify-center rounded-md border-[0.5px] border-border-subtle text-foreground hover:bg-raised"
                    aria-label="Menos"
                    onClick={() => bumpQty(lineKey(c), -1)}
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="min-w-[1.25rem] text-center text-xs font-semibold tabular-nums">
                    {c.quantity}
                  </span>
                  <button
                    type="button"
                    className="inline-flex size-7 min-h-[28px] min-w-[28px] shrink-0 items-center justify-center rounded-md border-[0.5px] border-border-subtle text-foreground hover:bg-raised"
                    aria-label="Más"
                    onClick={() => bumpQty(lineKey(c), 1)}
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        className="shrink-0 border-t-[0.5px] border-border-subtle p-2"
        style={{ background: "var(--nuba-raised)" }}
      >
        <div className="mb-2 flex justify-between text-xs font-semibold text-foreground">
          <span>Total</span>
          <span>{money.format(cartTotal)}</span>
        </div>
        <Button
          variant="primary"
          size="sm"
          className="w-full bg-accent text-accent-text"
          isDisabled={internalCart.length === 0}
          onPress={() => {
            if (internalCart.length === 0) {
              return;
            }
            onCartChange([...internalCart]);
            setInternalCart([]);
            setSheetOpen(false);
          }}
        >
          Agregar a la orden
        </Button>
      </div>
    </div>
  );

  const chipsRow = (
    <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 md:hidden">
      <button
        type="button"
        onClick={() => {
          setActiveCategoryId(ALL);
          setSearchInput("");
          setDebouncedSearch("");
        }}
        className="shrink-0 rounded-full border-[0.5px] px-3 py-1.5 text-xs font-medium"
        style={
          activeCategoryId === ALL && debouncedSearch.length === 0
            ? {
                borderColor: "var(--nuba-accent)",
                background: "var(--nuba-accent-soft)",
                color: "var(--nuba-accent)",
              }
            : {
                borderColor: "var(--border-subtle)",
                color: "var(--foreground)",
              }
        }
      >
        Todos
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => {
            setActiveCategoryId(c.id);
            setSearchInput("");
            setDebouncedSearch("");
          }}
          className="max-w-[10rem] shrink-0 truncate rounded-full border-[0.5px] px-3 py-1.5 text-xs font-medium"
          style={
            activeCategoryId === c.id
              ? {
                  borderColor: "var(--nuba-accent)",
                  background: "var(--nuba-accent-soft)",
                  color: "var(--nuba-accent)",
                }
              : {
                  borderColor: "var(--border-subtle)",
                  color: "var(--foreground)",
                }
          }
        >
          {c.name}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {isNarrow ? (
        <>
          <Input
            variant="secondary"
            placeholder="Buscar productos…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.currentTarget.value)}
          />
          {chipsRow}
          <div
            className="flex min-h-[460px] flex-col gap-1 overflow-hidden rounded-[10px] border-[0.5px] border-border-subtle"
            style={{ background: "var(--nuba-surface)" }}
          >
            {productGrid}
          </div>
          <div
            className="sticky bottom-0 z-10 flex items-center justify-between gap-2 border-t-[0.5px] border-border-subtle px-2 py-2"
            style={{
              background: "var(--nuba-surface)",
              paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
            }}
          >
            <div className="min-w-0 flex-1">
              <Text className="truncate text-sm font-semibold text-foreground">
                {money.format(cartTotal)}
              </Text>
            </div>
            <Button
              variant="secondary"
              size="sm"
              isDisabled={internalCart.length === 0}
              onPress={() => setSheetOpen(true)}
            >
              Ver comanda ({internalCart.length})
            </Button>
          </div>
          {sheetOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-[300]"
                style={{ background: "var(--nuba-scrim)" }}
                aria-label="Cerrar comanda"
                onClick={() => setSheetOpen(false)}
              />
              <div
                className="fixed inset-x-0 bottom-0 z-[301] flex max-h-[60vh] flex-col rounded-t-2xl border-t-[0.5px] border-border-subtle shadow-2xl"
                style={{ background: "var(--nuba-surface)" }}
              >
                <div
                  className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full cursor-grab active:cursor-grabbing"
                  style={{ background: "var(--border-default)" }}
                  onClick={() => setSheetOpen(false)}
                  role="presentation"
                />
                <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2">
                  <div className="flex h-full max-h-[calc(60vh-3rem)] flex-col">
                    <div className="shrink-0 py-2">
                      <Text className="text-sm font-semibold text-foreground">
                        Comanda
                      </Text>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      {internalCart.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-6">
                          <ShoppingCart
                            className="size-8"
                            style={{ color: "var(--foreground-muted)" }}
                          />
                          <Text className="text-xs text-foreground-secondary">
                            Sin productos aún
                          </Text>
                        </div>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {internalCart.map((c) => (
                            <li
                              key={lineKey(c)}
                              className="rounded-lg border-[0.5px] border-border-subtle px-2 py-2"
                            >
                              <div className="truncate text-sm font-medium">
                                {c.name}
                              </div>
                              <div className="mt-2 flex items-center justify-between">
                                <button
                                  type="button"
                                  className="inline-flex size-7 min-h-[28px] min-w-[28px] items-center justify-center rounded-md border-[0.5px] border-border-subtle"
                                  onClick={() => bumpQty(lineKey(c), -1)}
                                >
                                  <Minus className="size-3.5" />
                                </button>
                                <span className="text-sm font-semibold tabular-nums">
                                  {c.quantity}
                                </span>
                                <button
                                  type="button"
                                  className="inline-flex size-7 min-h-[28px] min-w-[28px] items-center justify-center rounded-md border-[0.5px] border-border-subtle"
                                  onClick={() => bumpQty(lineKey(c), 1)}
                                >
                                  <Plus className="size-3.5" />
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div
                      className="shrink-0 border-t-[0.5px] border-border-subtle pt-2"
                      style={{ background: "var(--nuba-surface)" }}
                    >
                      <div className="mb-2 flex justify-between text-sm font-semibold">
                        <span>Total</span>
                        <span>{money.format(cartTotal)}</span>
                      </div>
                      <Button
                        variant="primary"
                        className="w-full bg-accent text-accent-text"
                        isDisabled={internalCart.length === 0}
                        onPress={() => {
                          if (internalCart.length === 0) {
                            return;
                          }
                          onCartChange([...internalCart]);
                          setInternalCart([]);
                          setSheetOpen(false);
                        }}
                      >
                        Agregar a la orden
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </>
      ) : (
        <div
          className="grid h-[460px] min-h-0 w-full overflow-hidden rounded-[10px] border-[0.5px] border-border-subtle"
          style={{
            gridTemplateColumns: "200px minmax(0, 1fr) 190px",
            gridTemplateRows: "minmax(0, 1fr)",
            background: "var(--nuba-surface)",
          }}
        >
          <div
            className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r-[0.5px] border-border-subtle p-2"
            style={{ width: 200 }}
          >
            {categoryList}
          </div>
          {productGrid}
          {comandaColumn}
        </div>
      )}
    </div>
  );
});
