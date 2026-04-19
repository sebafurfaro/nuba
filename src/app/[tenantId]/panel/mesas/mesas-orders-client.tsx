"use client";

import { BadgeLabel, BadgeRoot, Button, Text, useOverlayState } from "@heroui/react";
import { Columns, LayoutGrid, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { canAccessPanelTrail } from "@/lib/permissions";
import type { Role } from "@/lib/permissions";
import type { Order, OrderStatus, OrderType } from "@/types/order";

import { NewOrderModal, type LocationRow } from "./new-order-modal";
import { OrderDrawer } from "./order-drawer";

const LS_VIEW = "nuba-mesas-view";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function elapsedLabel(iso: string): string {
  const t = new Date(iso).getTime();
  const d = Math.max(0, Date.now() - t);
  const m = Math.floor(d / 60000);
  if (m < 60) {
    return `${m} min`;
  }
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

function typeLabel(t: OrderType): string {
  switch (t) {
    case "dine_in":
      return "Salón";
    case "takeaway":
      return "Take away";
    case "delivery":
      return "Delivery";
    default:
      return "Online";
  }
}

type LocationApi = LocationRow & {
  active_order_count: number;
  active_orders_preview?: Array<{
    id: string;
    status_key: string;
    total: number;
    created_at: string;
    item_count: number;
    status_color?: string;
    status_label?: string;
  }>;
};

type MesasOrdersClientProps = {
  tenantId: string;
  role: Role;
};

export function MesasOrdersClient({ tenantId, role }: MesasOrdersClientProps) {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [locations, setLocations] = useState<LocationApi[]>([]);
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<"all" | OrderType>("all");
  const [viewMode, setViewMode] = useState<"map" | "kanban">("map");
  const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null);
  const newOrderModal = useOverlayState();
  const [newOrderLocationId, setNewOrderLocationId] = useState<string | null>(null);

  const enableTables = flags.enable_tables !== false;
  const enableTakeaway = flags.enable_takeaway !== false;
  const enableDelivery = flags.enable_delivery === true;
  const canManageUbicaciones = canAccessPanelTrail(role, "ubicaciones");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const v = window.localStorage.getItem(LS_VIEW);
    if (v === "map" || v === "kanban") {
      setViewMode(v);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(LS_VIEW, viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (enableTables && viewMode === "map") {
      return;
    }
    if (!enableTables && viewMode === "map") {
      setViewMode("kanban");
    }
  }, [enableTables, viewMode]);

  const fetchAll = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
    }
    try {
      const [fRes, lRes, sRes, oRes] = await Promise.all([
        fetch(`/api/${tenantId}/banderas`, { credentials: "include" }),
        fetch(`/api/${tenantId}/ubicaciones`, { credentials: "include" }),
        fetch(`/api/${tenantId}/estados-orden`, { credentials: "include" }),
        fetch(`/api/${tenantId}/ordenes`, { credentials: "include" }),
      ]);
      if (fRes.ok) {
        const fj = (await fRes.json()) as { flags?: Record<string, boolean> };
        setFlags(fj.flags ?? {});
      }
      if (lRes.ok) {
        const lj = (await lRes.json()) as { locations?: LocationApi[] };
        setLocations(lj.locations ?? []);
      }
      if (sRes.ok) {
        const sj = (await sRes.json()) as { statuses?: OrderStatus[] };
        setStatuses(sj.statuses ?? []);
      }
      if (oRes.ok) {
        const oj = (await oRes.json()) as { orders?: Order[] };
        setOrders(oj.orders ?? []);
      }
    } finally {
      if (!opts?.silent) {
        setLoading(false);
      }
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchAll();
    const id = window.setInterval(() => void fetchAll({ silent: true }), 30_000);
    return () => window.clearInterval(id);
  }, [fetchAll]);

  const activeCount = orders.length;

  const kanbanStatuses = useMemo(
    () =>
      [...statuses]
        .filter(
          (s) =>
            !s.is_terminal &&
            s.key !== "closed" &&
            s.key !== "cancelled",
        )
        .sort((a, b) => a.sort_order - b.sort_order),
    [statuses],
  );

  const filteredOrders = useMemo(() => {
    if (filterType === "all") {
      return orders;
    }
    return orders.filter((o) => o.type === filterType);
  }, [orders, filterType]);

  const tableLocations = useMemo(
    () => locations.filter((l) => l.type === "table"),
    [locations],
  );
  const outletLocations = useMemo(
    () =>
      locations.filter(
        (l) =>
          l.type === "takeaway" ||
          l.type === "delivery" ||
          l.type === "counter",
      ),
    [locations],
  );

  function openNewOrder(locId: string | null) {
    setNewOrderLocationId(locId);
    newOrderModal.open();
  }

  function openDrawer(orderId: string) {
    setDrawerOrderId(orderId);
  }

  const locationRowsForModal: LocationRow[] = locations;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="flex flex-col gap-3 border-b border-border-subtle pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Text className="text-xl font-semibold tracking-tight text-foreground">
            Órdenes
          </Text>
          <BadgeRoot variant="soft" className="border border-border-subtle bg-raised">
            <BadgeLabel className="tabular-nums">{activeCount} activas</BadgeLabel>
          </BadgeRoot>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-2 flex rounded-lg border border-border-subtle bg-surface p-0.5">
            {enableTables ? (
              <Button
                size="sm"
                variant={viewMode === "map" ? "primary" : "ghost"}
                className={viewMode === "map" ? "bg-accent text-accent-text" : ""}
                isIconOnly
                aria-label="Vista mapa"
                onPress={() => setViewMode("map")}
              >
                <LayoutGrid className="size-4" />
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={viewMode === "kanban" ? "primary" : "ghost"}
              className={viewMode === "kanban" ? "bg-accent text-accent-text" : ""}
              isIconOnly
              aria-label="Vista kanban"
              onPress={() => setViewMode("kanban")}
            >
              <Columns className="size-4" />
            </Button>
          </div>
          <Button
            size="sm"
            variant="primary"
            className="bg-accent text-accent-text"
            onPress={() => openNewOrder(null)}
          >
            <Plus className="size-4" />
            Nueva orden
          </Button>
        </div>
      </header>

      {!loading && locations.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-border-subtle bg-surface/60 px-4 py-3 text-sm text-foreground-secondary"
          role="status"
        >
          {canManageUbicaciones ? (
            <>
              No hay ubicaciones cargadas. Creá al menos una mesa, mostrador o
              punto de take away en{" "}
              <Link
                href={`/${tenantId}/panel/ubicaciones`}
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                Ubicaciones
              </Link>{" "}
              para poder tomar órdenes.
            </>
          ) : (
            <>
              No hay ubicaciones configuradas para este comercio. Pedile a un
              administrador que las cargue en el panel.
            </>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-border-subtle pb-2">
        <TabChip active={filterType === "all"} onClick={() => setFilterType("all")}>
          Todos
        </TabChip>
        {enableTables ? (
          <TabChip
            active={filterType === "dine_in"}
            onClick={() => setFilterType("dine_in")}
          >
            Salón
          </TabChip>
        ) : null}
        {enableTakeaway ? (
          <TabChip
            active={filterType === "takeaway"}
            onClick={() => setFilterType("takeaway")}
          >
            Take away
          </TabChip>
        ) : null}
        {enableDelivery ? (
          <TabChip
            active={filterType === "delivery"}
            onClick={() => setFilterType("delivery")}
          >
            Delivery
          </TabChip>
        ) : null}
      </div>

      {loading ? (
        <Text className="text-sm text-foreground-muted">Cargando…</Text>
      ) : null}

      {!loading && viewMode === "map" && enableTables ? (
        <div className="flex flex-col gap-8">
          <section>
            <Text className="mb-3 text-sm font-medium text-foreground-secondary">
              Mesas
            </Text>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {tableLocations.map((loc) => (
                <LocationTableCard
                  key={loc.id}
                  loc={loc}
                  onOccupied={() => {
                    const id = loc.active_orders_preview?.[0]?.id;
                    if (id) {
                      openDrawer(id);
                    }
                  }}
                  onFree={() => openNewOrder(loc.id)}
                />
              ))}
            </div>
          </section>
          {outletLocations.length > 0 ? (
            <section>
            <Text className="mb-3 text-sm font-medium text-foreground-secondary">
              Take away, delivery y mostrador
            </Text>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {outletLocations.map((loc) => (
                  <LocationTableCard
                    key={loc.id}
                    loc={loc}
                    onOccupied={() => {
                      const id = loc.active_orders_preview?.[0]?.id;
                      if (id) {
                        openDrawer(id);
                      }
                    }}
                    onFree={() => openNewOrder(loc.id)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {!loading && viewMode === "kanban" && kanbanStatuses.length === 0 ? (
        <Text className="text-sm text-foreground-muted">
          No hay estados configurados para el tablero. Configurá estados en administración.
        </Text>
      ) : null}

      {!loading && viewMode === "kanban" && kanbanStatuses.length > 0 ? (
        <div className="flex min-h-[480px] gap-3 overflow-x-auto pb-2">
          {kanbanStatuses.map((col) => {
            const colOrders = filteredOrders.filter((o) => o.status_key === col.key);
            const colTotal = colOrders.reduce((s, o) => s + o.total, 0);
            return (
              <div
                key={col.id}
                className="flex w-[280px] shrink-0 flex-col rounded-xl border border-border-subtle bg-surface/80"
                style={{ maxHeight: "min(70dvh, 720px)" }}
              >
                <div className="shrink-0 border-b border-border-subtle px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <Text className="text-sm font-semibold text-foreground">
                      {col.label}
                    </Text>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: col.color }}
                      aria-hidden
                    />
                  </div>
                  <Text className="text-xs text-foreground-muted">
                    {colOrders.length} órdenes · {money.format(colTotal)}
                  </Text>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                  {colOrders.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className="w-full rounded-lg border border-border-subtle bg-raised/50 p-3 text-start transition hover:bg-raised"
                      onClick={() => openDrawer(o.id)}
                    >
                      <Text className="font-medium text-foreground">
                        {o.location?.name ?? "Sin ubicación"}
                      </Text>
                      <span className="mt-1 inline-block rounded bg-background px-1.5 py-0.5 text-[10px] text-foreground-secondary">
                        {typeLabel(o.type)}
                      </span>
                      {(o.customer_name || o.customer_id) ? (
                        <Text className="mt-1 line-clamp-1 text-xs text-foreground-muted">
                          {o.customer_name ?? "Cliente registrado"}
                        </Text>
                      ) : null}
                      <Text className="mt-1 text-sm font-semibold text-foreground">
                        {money.format(o.total)}
                      </Text>
                      <Text className="text-xs text-foreground-muted">
                        {elapsedLabel(o.created_at)}
                      </Text>
                      <Text className="mt-2 line-clamp-2 text-xs text-foreground-secondary">
                        {formatItemsSummary(o)}
                      </Text>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <OrderDrawer
        tenantId={tenantId}
        orderId={drawerOrderId}
        open={drawerOrderId !== null}
        onClose={() => setDrawerOrderId(null)}
        statuses={statuses}
        onChanged={() => void fetchAll({ silent: true })}
      />

      <NewOrderModal
        tenantId={tenantId}
        state={newOrderModal}
        locations={locationRowsForModal}
        initialLocationId={newOrderLocationId}
        allowTakeaway={enableTakeaway}
        allowDelivery={enableDelivery}
        canManageUbicaciones={canManageUbicaciones}
        onCreated={() => void fetchAll({ silent: true })}
      />
    </div>
  );
}

function TabChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-accent text-accent-text"
          : "bg-raised text-foreground-secondary hover:bg-raised/80"
      }`}
    >
      {children}
    </button>
  );
}

function LocationTableCard({
  loc,
  onOccupied,
  onFree,
}: {
  loc: LocationApi;
  onOccupied: () => void;
  onFree: () => void;
}) {
  const occupied = loc.active_order_count > 0;
  const preview = loc.active_orders_preview?.[0];
  const borderColor = preview?.status_color ?? "var(--nuba-border-default)";
  const bg = occupied ? "var(--nuba-accent-soft)" : "var(--nuba-surface)";

  return (
    <button
      type="button"
      onClick={() => (occupied ? onOccupied() : onFree())}
      className="flex min-h-[120px] flex-col items-center justify-center rounded-xl border-2 p-3 text-center transition hover:opacity-95"
      style={{
        borderColor,
        background: bg,
      }}
    >
      <Text className="text-lg font-semibold text-foreground">{loc.name}</Text>
      {occupied && preview ? (
        <>
          <Text className="mt-2 text-xs text-foreground-muted">
            {elapsedLabel(preview.created_at)}
          </Text>
          <Text className="text-sm font-semibold text-foreground">
            {money.format(preview.total)}
          </Text>
          <Text className="text-xs text-foreground-secondary">
            {preview.item_count} ítems
          </Text>
          {loc.active_order_count > 1 ? (
            <Text className="mt-1 text-[10px] font-medium text-foreground-secondary">
              +{loc.active_order_count - 1} más
            </Text>
          ) : null}
          {preview.status_label ? (
            <span
              className="mt-2 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor:
                  preview.status_color ?? "var(--nuba-badge-neutral-bg)",
                color: "var(--nuba-accent-text)",
              }}
            >
              {preview.status_label}
            </span>
          ) : null}
        </>
      ) : (
        <>
          <Plus className="mt-2 size-8 text-foreground-muted" />
          <Text className="mt-1 text-xs text-foreground-secondary">Abrir orden</Text>
          <span className="mt-2 rounded-full bg-raised px-2 py-0.5 text-[10px] font-medium text-foreground-secondary">
            Libre
          </span>
        </>
      )}
    </button>
  );
}

function formatItemsSummary(o: Order): string {
  const names = o.items.slice(0, 3).map((i) => i.name);
  const rest = o.items.length - 3;
  const base = names.join(", ");
  if (rest > 0) {
    return `${base} y ${rest} más`;
  }
  return base || "Sin ítems";
}
