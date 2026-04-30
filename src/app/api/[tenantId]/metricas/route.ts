import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { pool } from "@/lib/db";
import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import type {
  MetricasDashboard,
  MetricasProductos,
  MetricasReservas,
  MetricasVentas,
  RangoMetricas,
} from "@/types/metricas";

type Ctx = { params: Promise<{ tenantId: string }> };

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function resolveRango(
  rango: RangoMetricas,
  desde?: string,
  hasta?: string,
): {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
} {
  const now = new Date();
  const today = toDateStr(now);

  if (rango === "hoy") {
    const ayer = toDateStr(new Date(now.getTime() - 86_400_000));
    return { start: today, end: today, prevStart: ayer, prevEnd: ayer };
  }

  if (rango === "semana") {
    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    const startStr = toDateStr(monday);
    const prevMonday = new Date(monday);
    prevMonday.setDate(monday.getDate() - 7);
    const prevSunday = new Date(monday);
    prevSunday.setDate(monday.getDate() - 1);
    return {
      start: startStr,
      end: today,
      prevStart: toDateStr(prevMonday),
      prevEnd: toDateStr(prevSunday),
    };
  }

  if (rango === "mes") {
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      start: toDateStr(firstOfMonth),
      end: today,
      prevStart: toDateStr(firstOfPrevMonth),
      prevEnd: toDateStr(lastOfPrevMonth),
    };
  }

  // personalizado
  const startStr = desde ?? today;
  const endStr = hasta ?? today;
  const startMs = new Date(startStr).getTime();
  const endMs = new Date(endStr).getTime();
  const intervalMs = endMs - startMs + 86_400_000;
  const prevEnd = new Date(startMs - 86_400_000);
  const prevStart = new Date(prevEnd.getTime() - intervalMs + 86_400_000);
  return {
    start: startStr,
    end: endStr,
    prevStart: toDateStr(prevStart),
    prevEnd: toDateStr(prevEnd),
  };
}

function pct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) return denied;

  const { tenantUuid } = gate;

  const url = new URL(request.url);
  const rango = (url.searchParams.get("rango") ?? "mes") as RangoMetricas;
  const desde = url.searchParams.get("desde") ?? undefined;
  const hasta = url.searchParams.get("hasta") ?? undefined;

  const { start, end, prevStart, prevEnd } = resolveRango(
    rango,
    desde,
    hasta,
  );

  // Statuses that count as valid sales (not cancelled)
  const CANCELLED_STATUSES = ["cancelado", "cancelled"];
  const cancelledPlaceholders = CANCELLED_STATUSES.map(() => "?").join(", ");

  try {
    const [
      [ventasRows],
      [ventasPrevRows],
      [ingresosDiaRows],
      [ordenesDiaRows],
      [reservasRows],
      [reservasPrevRows],
      [reservasDiaRows],
      [masVendidosRows],
      [categoriasRows],
    ] = await Promise.all([
      // Ventas período actual
      pool.execute<RowDataPacket[]>(
        `SELECT
           COALESCE(SUM(total), 0)   AS total_ingresos,
           COUNT(*)                   AS total_ordenes
         FROM orders
         WHERE tenant_id = ?
           AND DATE(created_at) BETWEEN ? AND ?
           AND status NOT IN (${cancelledPlaceholders})`,
        [tenantUuid, start, end, ...CANCELLED_STATUSES],
      ),

      // Ventas período anterior
      pool.execute<RowDataPacket[]>(
        `SELECT
           COALESCE(SUM(total), 0)   AS total_ingresos,
           COUNT(*)                   AS total_ordenes
         FROM orders
         WHERE tenant_id = ?
           AND DATE(created_at) BETWEEN ? AND ?
           AND status NOT IN (${cancelledPlaceholders})`,
        [tenantUuid, prevStart, prevEnd, ...CANCELLED_STATUSES],
      ),

      // Ingresos por día
      pool.execute<RowDataPacket[]>(
        `SELECT
           DATE(created_at)       AS fecha,
           COALESCE(SUM(total),0) AS total
         FROM orders
         WHERE tenant_id = ?
           AND DATE(created_at) BETWEEN ? AND ?
           AND status NOT IN (${cancelledPlaceholders})
         GROUP BY DATE(created_at)
         ORDER BY fecha ASC`,
        [tenantUuid, start, end, ...CANCELLED_STATUSES],
      ),

      // Órdenes por día
      pool.execute<RowDataPacket[]>(
        `SELECT
           DATE(created_at) AS fecha,
           COUNT(*)          AS cantidad
         FROM orders
         WHERE tenant_id = ?
           AND DATE(created_at) BETWEEN ? AND ?
           AND status NOT IN (${cancelledPlaceholders})
         GROUP BY DATE(created_at)
         ORDER BY fecha ASC`,
        [tenantUuid, start, end, ...CANCELLED_STATUSES],
      ),

      // Reservas período actual
      pool.execute<RowDataPacket[]>(
        `SELECT
           COUNT(*)                                             AS total_reservas,
           SUM(status = 'confirmed')                           AS confirmadas,
           SUM(status = 'pending')                             AS pendientes,
           SUM(status = 'no_show')                             AS no_shows
         FROM reservations
         WHERE tenant_id = ?
           AND DATE(date) BETWEEN ? AND ?`,
        [tenantUuid, start, end],
      ),

      // Reservas período anterior
      pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total_reservas
         FROM reservations
         WHERE tenant_id = ?
           AND DATE(date) BETWEEN ? AND ?`,
        [tenantUuid, prevStart, prevEnd],
      ),

      // Reservas por día
      pool.execute<RowDataPacket[]>(
        `SELECT
           DATE(date)  AS fecha,
           COUNT(*)     AS cantidad
         FROM reservations
         WHERE tenant_id = ?
           AND DATE(date) BETWEEN ? AND ?
         GROUP BY DATE(date)
         ORDER BY fecha ASC`,
        [tenantUuid, start, end],
      ),

      // Top 10 productos más vendidos
      pool.execute<RowDataPacket[]>(
        `SELECT
           oi.product_id                              AS productoId,
           oi.name                                    AS nombre,
           SUM(oi.quantity)                           AS cantidad,
           SUM(oi.quantity * oi.unit_price)           AS ingresos
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.tenant_id = ?
           AND DATE(o.created_at) BETWEEN ? AND ?
           AND o.status NOT IN (${cancelledPlaceholders})
         GROUP BY oi.product_id, oi.name
         ORDER BY cantidad DESC
         LIMIT 10`,
        [tenantUuid, start, end, ...CANCELLED_STATUSES],
      ),

      // Top 5 categorías por ingresos
      pool.execute<RowDataPacket[]>(
        `SELECT
           p.category_id                              AS categoriaId,
           COALESCE(c.name, 'Sin categoría')          AS nombre,
           SUM(oi.quantity * oi.unit_price)           AS ingresos
         FROM order_items oi
         JOIN orders o   ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE o.tenant_id = ?
           AND DATE(o.created_at) BETWEEN ? AND ?
           AND o.status NOT IN (${cancelledPlaceholders})
         GROUP BY p.category_id, c.name
         ORDER BY ingresos DESC
         LIMIT 5`,
        [tenantUuid, start, end, ...CANCELLED_STATUSES],
      ),
    ]);

    // ── Ventas ──────────────────────────────────────────────────────────────
    const vRow = ventasRows[0]!;
    const vPrev = ventasPrevRows[0]!;
    const totalIngresos = num(vRow.total_ingresos);
    const totalOrdenes = num(vRow.total_ordenes);
    const prevIngresos = num(vPrev.total_ingresos);
    const prevOrdenes = num(vPrev.total_ordenes);

    const ventas: MetricasVentas = {
      total_ingresos: totalIngresos,
      total_ordenes: totalOrdenes,
      ticket_promedio: totalOrdenes > 0 ? totalIngresos / totalOrdenes : 0,
      variacion_ingresos: pct(totalIngresos, prevIngresos),
      variacion_ordenes: pct(totalOrdenes, prevOrdenes),
      ingresos_por_dia: ingresosDiaRows.map((r) => ({
        fecha: String(r.fecha).slice(0, 10),
        total: num(r.total),
      })),
      ordenes_por_dia: ordenesDiaRows.map((r) => ({
        fecha: String(r.fecha).slice(0, 10),
        cantidad: num(r.cantidad),
      })),
    };

    // ── Reservas ─────────────────────────────────────────────────────────────
    const rRow = reservasRows[0]!;
    const rPrev = reservasPrevRows[0]!;
    const totalReservas = num(rRow.total_reservas);
    const noShows = num(rRow.no_shows);

    const reservas: MetricasReservas = {
      total_reservas: totalReservas,
      confirmadas: num(rRow.confirmadas),
      pendientes: num(rRow.pendientes),
      no_shows: noShows,
      tasa_no_show:
        totalReservas > 0
          ? Math.round((noShows / totalReservas) * 1000) / 10
          : 0,
      variacion_reservas: pct(totalReservas, num(rPrev.total_reservas)),
      reservas_por_dia: reservasDiaRows.map((r) => ({
        fecha: String(r.fecha).slice(0, 10),
        cantidad: num(r.cantidad),
      })),
    };

    // ── Productos ─────────────────────────────────────────────────────────────
    const productos: MetricasProductos = {
      mas_vendidos: masVendidosRows.map((r) => ({
        productoId: String(r.productoId ?? ""),
        nombre: String(r.nombre ?? ""),
        cantidad: num(r.cantidad),
        ingresos: num(r.ingresos),
      })),
      categorias_top: categoriasRows.map((r) => ({
        categoriaId: String(r.categoriaId ?? "sin-categoria"),
        nombre: String(r.nombre ?? "Sin categoría"),
        ingresos: num(r.ingresos),
      })),
    };

    const response: MetricasDashboard = { ventas, reservas, productos };
    return NextResponse.json(response);
  } catch (e) {
    console.error("[GET /api/[tenantId]/metricas]", e);
    return NextResponse.json(
      { error: "Error al cargar las métricas" },
      { status: 500 },
    );
  }
}
