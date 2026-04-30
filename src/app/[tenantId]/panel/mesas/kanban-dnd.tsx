"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "@heroui/react";
import { GripVertical } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Role } from "@/lib/permissions";
import type { Order, OrderStatus, OrderType } from "@/types/order";

// ── Helpers ────────────────────────────────────────────────────────────────

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function elapsedLabel(iso: string): string {
  const t = new Date(iso).getTime();
  const d = Math.max(0, Date.now() - t);
  const m = Math.floor(d / 60000);
  if (m < 60) return `${m} min`;
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

function formatItemsSummary(o: Order): string {
  const names = o.items.slice(0, 3).map((i) => i.name);
  const rest = o.items.length - 3;
  const base = names.join(", ");
  if (rest > 0) return `${base} y ${rest} más`;
  return base || "Sin ítems";
}

// ── canMoveTo (función pura, testeable de forma aislada) ───────────────────

export function canMoveTo(
  origin: OrderStatus,
  destination: OrderStatus,
): { allowed: boolean; reason?: string } {
  if (destination.is_terminal) {
    return {
      allowed: false,
      reason: "Para cerrar la orden usá el botón de cierre",
    };
  }
  if (destination.sort_order <= origin.sort_order) {
    return {
      allowed: false,
      reason: "No podés retroceder el estado de una orden",
    };
  }
  return { allowed: true };
}

// ── CardBody — contenido visual compartido entre card real y overlay ────────

function CardBody({
  order: o,
  showDragHandle,
}: {
  order: Order;
  showDragHandle: boolean;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-1">
        <span className="text-sm font-medium leading-tight text-foreground">
          {o.location?.name ?? "Sin ubicación"}
        </span>
        {showDragHandle && (
          <GripVertical
            className="mt-0.5 size-4 shrink-0 text-foreground-muted opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        )}
      </div>
      <span className="mt-1 inline-block rounded bg-background px-1.5 py-0.5 text-[10px] text-foreground-secondary">
        {typeLabel(o.type)}
      </span>
      {o.customer_name ?? o.customer_id ? (
        <p className="mt-1 line-clamp-1 text-xs text-foreground-muted">
          {o.customer_name ?? "Cliente registrado"}
        </p>
      ) : null}
      <p className="mt-1 text-sm font-semibold text-foreground">
        {money.format(o.total)}
      </p>
      <p className="text-xs text-foreground-muted">{elapsedLabel(o.created_at)}</p>
      <p className="mt-2 line-clamp-2 text-xs text-foreground-secondary">
        {formatItemsSummary(o)}
      </p>
    </>
  );
}

// ── KanbanCard — draggable ─────────────────────────────────────────────────

type KanbanCardProps = {
  order: Order;
  disabled: boolean;
  showDragHandle: boolean;
  onClick: () => void;
};

function KanbanCard({ order, disabled, showDragHandle, onClick }: KanbanCardProps) {
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({
    id: order.id,
    disabled,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={[
        "group relative w-full select-none rounded-lg border p-3 text-start transition-all",
        isDragging
          ? "border-dashed border-border-subtle bg-raised/50 opacity-40"
          : "border-border-subtle bg-raised/50 hover:bg-raised",
        disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
      ].join(" ")}
    >
      <CardBody order={order} showDragHandle={showDragHandle && !disabled} />
    </div>
  );
}

// ── KanbanCardOverlay — versión estática para DragOverlay ──────────────────

function KanbanCardOverlay({ order }: { order: Order }) {
  return (
    <div className="group w-[268px] cursor-grabbing select-none rounded-lg border border-border-subtle bg-raised/90 p-3 opacity-85 shadow-xl ring-2 ring-accent/30">
      <CardBody order={order} showDragHandle />
    </div>
  );
}

// ── KanbanColumn — droppable ───────────────────────────────────────────────

type KanbanColumnProps = {
  status: OrderStatus;
  orders: Order[];
  /** Si hay drag activo, indica si esta columna puede recibir la card */
  isValidTarget: boolean;
  isDragging: boolean;
  onOpenOrder: (orderId: string) => void;
  cardDisabled: boolean;
  showDragHandle: boolean;
};

function KanbanColumn({
  status,
  orders,
  isValidTarget,
  isDragging,
  onOpenOrder,
  cardDisabled,
  showDragHandle,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status.key });
  const colTotal = orders.reduce((s, o) => s + o.total, 0);

  const highlighted = isOver && isValidTarget;
  const dimmed = isDragging && !isValidTarget;

  return (
    <div
      className={[
        "flex w-[280px] shrink-0 flex-col rounded-xl border transition-all duration-150",
        highlighted ? "ring-2" : "border-border-subtle",
        dimmed ? "opacity-50" : "bg-surface/80",
      ].join(" ")}
      style={{
        maxHeight: "min(70dvh, 720px)",
        ...(highlighted
          ? {
              borderColor: status.color,
              boxShadow: `0 0 0 2px ${status.color}40`,
            }
          : {}),
      }}
    >
      {/* Columna header */}
      <div className="shrink-0 border-b border-border-subtle px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">{status.label}</span>
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: status.color }}
            aria-hidden
          />
        </div>
        <span className="text-xs text-foreground-muted">
          {orders.length} órdenes · {money.format(colTotal)}
        </span>
      </div>

      {/* Área droppable */}
      <div
        ref={setNodeRef}
        className={[
          "min-h-[80px] flex-1 space-y-2 overflow-y-auto p-2 transition-colors duration-150",
          highlighted ? "rounded-b-xl" : "",
        ].join(" ")}
        style={
          highlighted ? { backgroundColor: `${status.color}18` } : undefined
        }
      >
        {orders.map((o) => (
          <KanbanCard
            key={o.id}
            order={o}
            disabled={cardDisabled}
            showDragHandle={showDragHandle}
            onClick={() => onOpenOrder(o.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── KanbanBoard ────────────────────────────────────────────────────────────

type KanbanBoardProps = {
  tenantId: string;
  statuses: OrderStatus[];
  orders: Order[];
  role: Role;
  onOpenOrder: (orderId: string) => void;
  onRefresh: () => void;
};

export function KanbanBoard({
  tenantId,
  statuses,
  orders,
  role,
  onOpenOrder,
  onRefresh,
}: KanbanBoardProps) {
  const [localOrders, setLocalOrders] = useState<Order[]>(orders);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const isDraggingRef = useRef(false);
  const snapshotRef = useRef<Order[]>([]);

  // Sincroniza del padre (polling cada 30s) solo cuando no hay drag activo
  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalOrders(orders);
    }
  }, [orders]);

  const canDrag = role === "admin" || role === "supervisor";

  const kanbanStatuses = useMemo(
    () =>
      [...statuses]
        .filter((s) => !s.is_terminal && s.key !== "closed" && s.key !== "cancelled")
        .sort((a, b) => a.sort_order - b.sort_order),
    [statuses],
  );

  const statusByKey = useMemo(
    () => new Map(statuses.map((s) => [s.key, s])),
    [statuses],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  function handleDragStart({ active }: DragStartEvent) {
    isDraggingRef.current = true;
    snapshotRef.current = structuredClone(localOrders);
    const found = localOrders.find((o) => o.id === active.id);
    setActiveOrder(found ?? null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    isDraggingRef.current = false;
    setActiveOrder(null);

    if (!over) return;

    const orderId = active.id as string;
    const destKey = over.id as string;

    const order = localOrders.find((o) => o.id === orderId);
    if (!order) return;

    const originStatus = statusByKey.get(order.status_key);
    const destStatus = statusByKey.get(destKey);

    if (!originStatus || !destStatus) return;
    if (originStatus.key === destStatus.key) return;

    const check = canMoveTo(originStatus, destStatus);
    if (!check.allowed) {
      toast.danger(check.reason ?? "No se puede mover la orden");
      return;
    }

    // Actualización optimista
    setLocalOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status_key: destKey } : o)),
    );

    void (async () => {
      try {
        const res = await fetch(`/api/${tenantId}/ordenes/${orderId}/estado`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status_key: destKey }),
        });
        if (!res.ok) throw new Error();
        onRefresh();
      } catch {
        setLocalOrders(snapshotRef.current);
        toast.danger("No se pudo mover la orden. Intentá de nuevo.");
      }
    })();
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex min-h-[480px] gap-3 overflow-x-auto pb-2">
        {kanbanStatuses.map((col) => {
          const colOrders = localOrders.filter((o) => o.status_key === col.key);

          let isValidTarget = true;
          if (activeOrder) {
            const originStatus = statusByKey.get(activeOrder.status_key);
            if (originStatus) {
              isValidTarget = canMoveTo(originStatus, col).allowed;
            }
          }

          return (
            <KanbanColumn
              key={col.id}
              status={col}
              orders={colOrders}
              isValidTarget={isValidTarget}
              isDragging={activeOrder !== null}
              onOpenOrder={onOpenOrder}
              cardDisabled={!canDrag}
              showDragHandle={canDrag}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeOrder ? <KanbanCardOverlay order={activeOrder} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
