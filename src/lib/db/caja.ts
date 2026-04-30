import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { pool } from "@/lib/db";
import type {
  CashRegister,
  CierreDetalle,
  OrdenHistorial,
  OrdenParaArchivar,
  OrdenesHistorialResponse,
  RentabilidadDia,
  RentabilidadPeriodo,
  RentabilidadProducto,
} from "@/types/caja";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function nullableIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function nullableNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function nullableStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function mapCashRegisterRow(r: RowDataPacket): CashRegister {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    branchId: String(r.branch_id),
    branchNombre: String(r.branch_nombre ?? ""),
    cerradoPor: String(r.cerrado_por),
    cerradoPorNombre: String(r.cerrado_por_nombre ?? ""),
    fechaCierre: r.fecha_cierre instanceof Date
      ? r.fecha_cierre.toISOString().slice(0, 10)
      : String(r.fecha_cierre).slice(0, 10),
    totalEfectivo: num(r.total_efectivo),
    totalMp: num(r.total_mp),
    totalOtros: num(r.total_otros),
    totalGeneral: num(r.total_general),
    cantidadOrdenes: num(r.cantidad_ordenes),
    notas: nullableStr(r.notas),
    createdAt: asIso(r.created_at),
  };
}

function mapOrdenParaArchivar(r: RowDataPacket): OrdenParaArchivar {
  return {
    id: String(r.id),
    locationNombre: String(r.location_nombre ?? "—"),
    tableNombre: nullableStr(r.table_nombre),
    statusKey: String(r.status_key),
    statusNombre: String(r.status_nombre ?? r.status_key),
    total: num(r.total),
    metodoPago: nullableStr(r.metodo_pago),
    closedAt: nullableIso(r.closed_at),
    cantidadItems: num(r.cantidad_items),
  };
}

// ---------------------------------------------------------------------------
// getOrdenesHistorial
// ---------------------------------------------------------------------------

export async function getOrdenesHistorial(
  tenantId: string,
  filters: {
    branchId?: string;
    desde?: string;
    hasta?: string;
    statusKey?: string;
    metodoPago?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<OrdenesHistorialResponse> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const params: unknown[] = [tenantId];
  let where = `WHERE o.tenant_id = ?`;

  if (filters.branchId) {
    where += ` AND o.branch_id = ?`;
    params.push(filters.branchId);
  }
  if (filters.desde) {
    where += ` AND DATE(o.created_at) >= ?`;
    params.push(filters.desde);
  }
  if (filters.hasta) {
    where += ` AND DATE(o.created_at) <= ?`;
    params.push(filters.hasta);
  }
  if (filters.statusKey) {
    where += ` AND o.status_key = ?`;
    params.push(filters.statusKey);
  }
  if (filters.metodoPago) {
    where += ` AND p.method = ?`;
    params.push(filters.metodoPago);
  }

  const countParams = [...params];
  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(DISTINCT o.id) AS total
     FROM orders o
     LEFT JOIN payments p ON p.order_id = o.id AND p.tenant_id = o.tenant_id AND p.status = 'aprobado'
     ${where}`,
    countParams,
  );
  const total = num(countRows[0]?.total);

  const dataParams = [...params, limit, offset];
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       o.id,
       o.branch_id,
       COALESCE(b.name, '—')          AS branch_nombre,
       COALESCE(l.name, '—')          AS location_nombre,
       COALESCE(t.name, NULL)         AS table_nombre,
       o.status_key,
       COALESCE(os.label, o.status_key) AS status_nombre,
       o.total,
       SUM(oi.unit_cost * oi.quantity)  AS total_costo,
       p.method                         AS metodo_pago,
       COUNT(oi.id)                     AS cantidad_items,
       o.archived_at,
       o.cash_register_id,
       o.created_at,
       p.created_at                     AS closed_at
     FROM orders o
     LEFT JOIN branches b        ON b.id = o.branch_id
     LEFT JOIN locations l       ON l.id = o.location_id
     LEFT JOIN \`tables\` t        ON t.id = o.table_id
     LEFT JOIN order_statuses os ON os.tenant_id = o.tenant_id AND os.\`key\` = o.status_key
     LEFT JOIN order_items oi    ON oi.order_id = o.id AND oi.tenant_id = o.tenant_id
     LEFT JOIN payments p        ON p.order_id = o.id AND p.tenant_id = o.tenant_id AND p.status = 'aprobado'
     ${where}
     GROUP BY o.id, b.name, l.name, t.name, os.label, p.method, p.created_at
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    dataParams,
  );

  const ordenes: OrdenHistorial[] = rows.map((r, i) => {
    const totalVenta = num(r.total);
    const totalCosto = nullableNum(r.total_costo);
    const margen = totalCosto !== null ? totalVenta - totalCosto : null;
    const margenPct =
      margen !== null && totalVenta > 0
        ? Math.round((margen / totalVenta) * 10000) / 100
        : null;
    return {
      id: String(r.id),
      numero: offset + i + 1,
      branchId: String(r.branch_id ?? ""),
      branchNombre: String(r.branch_nombre),
      locationNombre: String(r.location_nombre),
      tableNombre: nullableStr(r.table_nombre),
      statusKey: String(r.status_key),
      statusNombre: String(r.status_nombre),
      total: totalVenta,
      totalCosto,
      margen,
      margenPct,
      metodoPago: nullableStr(r.metodo_pago),
      cantidadItems: num(r.cantidad_items),
      archivedAt: nullableIso(r.archived_at),
      cashRegisterId: nullableStr(r.cash_register_id),
      createdAt: asIso(r.created_at),
      closedAt: nullableIso(r.closed_at),
    };
  });

  return { ordenes, total, page, limit };
}

// ---------------------------------------------------------------------------
// getOrdenesParaArchivar
// ---------------------------------------------------------------------------

export async function getOrdenesParaArchivar(
  tenantId: string,
  branchId?: string,
): Promise<OrdenParaArchivar[]> {
  const params: unknown[] = [tenantId];
  let branchFilter = "";
  if (branchId) {
    branchFilter = ` AND o.branch_id = ?`;
    params.push(branchId);
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       o.id,
       COALESCE(l.name, '—')            AS location_nombre,
       COALESCE(t.name, NULL)           AS table_nombre,
       o.status_key,
       COALESCE(os.label, o.status_key) AS status_nombre,
       o.total,
       p.method                         AS metodo_pago,
       p.created_at                     AS closed_at,
       COUNT(oi.id)                     AS cantidad_items
     FROM orders o
     INNER JOIN order_statuses os
       ON os.tenant_id = o.tenant_id AND os.\`key\` = o.status_key AND os.is_terminal = TRUE
     LEFT JOIN locations l  ON l.id = o.location_id
     LEFT JOIN \`tables\` t  ON t.id = o.table_id
     LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.tenant_id = o.tenant_id
     LEFT JOIN payments p
       ON p.order_id = o.id AND p.tenant_id = o.tenant_id AND p.status = 'aprobado'
     WHERE o.tenant_id = ?
       AND o.archived_at IS NULL
       ${branchFilter}
     GROUP BY o.id, l.name, t.name, os.label, p.method, p.created_at
     ORDER BY o.updated_at DESC`,
    params,
  );

  return rows.map(mapOrdenParaArchivar);
}

// ---------------------------------------------------------------------------
// archivarOrdenes
// ---------------------------------------------------------------------------

export async function archivarOrdenes(
  tenantId: string,
  branchId: string,
  userId: string,
  ordenIds: string[],
  notas?: string,
): Promise<CashRegister> {
  if (!ordenIds.length) {
    throw new Error("Debe seleccionar al menos una orden");
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Verify all orders belong to tenant, branch, and are terminal + unarchived
    const placeholders = ordenIds.map(() => "?").join(",");
    const [checkRows] = await conn.query<RowDataPacket[]>(
      `SELECT o.id FROM orders o
       INNER JOIN order_statuses os
         ON os.tenant_id = o.tenant_id AND os.\`key\` = o.status_key AND os.is_terminal = TRUE
       WHERE o.tenant_id = ? AND o.branch_id = ? AND o.archived_at IS NULL AND o.id IN (${placeholders})`,
      [tenantId, branchId, ...ordenIds],
    );
    if (checkRows.length !== ordenIds.length) {
      throw new Error(
        "Algunas órdenes no son válidas para archivar (no son terminales, ya archivadas o de otra sucursal)",
      );
    }

    // Sum payments grouped by method
    const [payRows] = await conn.query<RowDataPacket[]>(
      `SELECT method, COALESCE(SUM(amount), 0) AS total
       FROM payments
       WHERE order_id IN (${placeholders}) AND tenant_id = ? AND status = 'aprobado'
       GROUP BY method`,
      [...ordenIds, tenantId],
    );

    let totalEfectivo = 0;
    let totalMp = 0;
    let totalOtros = 0;
    for (const pr of payRows) {
      const m = String(pr.method);
      const a = num(pr.total);
      if (m === "efectivo") {
        totalEfectivo += a;
      } else if (m === "mercadopago") {
        totalMp += a;
      } else {
        totalOtros += a;
      }
    }
    const totalGeneral = totalEfectivo + totalMp + totalOtros;

    const cashRegisterId = crypto.randomUUID();
    const today = new Date().toISOString().slice(0, 10);

    await conn.query<ResultSetHeader>(
      `INSERT INTO cash_registers
         (id, tenant_id, branch_id, cerrado_por, fecha_cierre,
          total_efectivo, total_mp, total_otros, total_general, cantidad_ordenes, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cashRegisterId,
        tenantId,
        branchId,
        userId,
        today,
        totalEfectivo,
        totalMp,
        totalOtros,
        totalGeneral,
        ordenIds.length,
        notas ?? null,
      ],
    );

    await conn.query<ResultSetHeader>(
      `UPDATE orders
       SET archived_at = NOW(), archived_by = ?, cash_register_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND id IN (${placeholders})`,
      [userId, cashRegisterId, tenantId, ...ordenIds],
    );

    await conn.commit();

    const [crRows] = await pool.query<RowDataPacket[]>(
      `SELECT cr.*,
              b.name                                          AS branch_nombre,
              CONCAT(u.first_name, ' ', u.last_name)         AS cerrado_por_nombre
       FROM cash_registers cr
       INNER JOIN branches b ON b.id = cr.branch_id
       INNER JOIN users u    ON u.id = cr.cerrado_por
       WHERE cr.id = ? LIMIT 1`,
      [cashRegisterId],
    );
    if (!crRows[0]) {
      throw new Error("Cierre de caja no encontrado tras crear");
    }
    return mapCashRegisterRow(crRows[0]);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// getCierresCaja
// ---------------------------------------------------------------------------

export async function getCierresCaja(
  tenantId: string,
  filters: {
    branchId?: string;
    desde?: string;
    hasta?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<{ cierres: CashRegister[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const params: unknown[] = [tenantId];
  let where = `WHERE cr.tenant_id = ?`;

  if (filters.branchId) {
    where += ` AND cr.branch_id = ?`;
    params.push(filters.branchId);
  }
  if (filters.desde) {
    where += ` AND cr.fecha_cierre >= ?`;
    params.push(filters.desde);
  }
  if (filters.hasta) {
    where += ` AND cr.fecha_cierre <= ?`;
    params.push(filters.hasta);
  }

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM cash_registers cr ${where}`,
    params,
  );
  const total = num(countRows[0]?.total);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT cr.*,
            b.name                                    AS branch_nombre,
            CONCAT(u.first_name, ' ', u.last_name)   AS cerrado_por_nombre
     FROM cash_registers cr
     INNER JOIN branches b ON b.id = cr.branch_id
     INNER JOIN users u    ON u.id = cr.cerrado_por
     ${where}
     ORDER BY cr.fecha_cierre DESC, cr.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return { cierres: rows.map(mapCashRegisterRow), total, page, limit };
}

// ---------------------------------------------------------------------------
// getCierreCajaById
// ---------------------------------------------------------------------------

export async function getCierreCajaById(
  tenantId: string,
  id: string,
): Promise<CierreDetalle | null> {
  const [crRows] = await pool.query<RowDataPacket[]>(
    `SELECT cr.*,
            b.name                                    AS branch_nombre,
            CONCAT(u.first_name, ' ', u.last_name)   AS cerrado_por_nombre
     FROM cash_registers cr
     INNER JOIN branches b ON b.id = cr.branch_id
     INNER JOIN users u    ON u.id = cr.cerrado_por
     WHERE cr.id = ? AND cr.tenant_id = ? LIMIT 1`,
    [id, tenantId],
  );
  if (!crRows[0]) {
    return null;
  }
  const cr = mapCashRegisterRow(crRows[0]);

  const [ordRows] = await pool.query<RowDataPacket[]>(
    `SELECT
       o.id,
       COALESCE(l.name, '—')            AS location_nombre,
       COALESCE(t.name, NULL)           AS table_nombre,
       o.status_key,
       COALESCE(os.label, o.status_key) AS status_nombre,
       o.total,
       p.method                         AS metodo_pago,
       p.created_at                     AS closed_at,
       COUNT(oi.id)                     AS cantidad_items
     FROM orders o
     LEFT JOIN locations l  ON l.id = o.location_id
     LEFT JOIN \`tables\` t  ON t.id = o.table_id
     LEFT JOIN order_statuses os
       ON os.tenant_id = o.tenant_id AND os.\`key\` = o.status_key
     LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.tenant_id = o.tenant_id
     LEFT JOIN payments p
       ON p.order_id = o.id AND p.tenant_id = o.tenant_id AND p.status = 'aprobado'
     WHERE o.cash_register_id = ? AND o.tenant_id = ?
     GROUP BY o.id, l.name, t.name, os.label, p.method, p.created_at
     ORDER BY o.updated_at DESC`,
    [id, tenantId],
  );

  return { ...cr, ordenes: ordRows.map(mapOrdenParaArchivar) };
}

// ---------------------------------------------------------------------------
// getRentabilidad
// ---------------------------------------------------------------------------

export async function getRentabilidad(
  tenantId: string,
  desde: string,
  hasta: string,
  branchId?: string,
): Promise<RentabilidadPeriodo> {
  const branchFilter = branchId ? ` AND o.branch_id = ?` : "";
  const baseParams: unknown[] = [tenantId, desde, hasta];
  if (branchId) {
    baseParams.push(branchId);
  }

  const [totalesRows, porProductoRows, porDiaRows] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT
         COALESCE(SUM(o.total), 0)                              AS total_ventas,
         COALESCE(SUM(oi.unit_cost * oi.quantity), 0)          AS total_costo
       FROM orders o
       INNER JOIN order_items oi ON oi.order_id = o.id AND oi.tenant_id = o.tenant_id
       WHERE o.tenant_id = ?
         AND DATE(o.archived_at) BETWEEN ? AND ?
         AND oi.unit_cost IS NOT NULL
         ${branchFilter}`,
      baseParams,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT
         p.id                                                        AS producto_id,
         p.name                                                      AS producto_nombre,
         COALESCE(SUM(oi.quantity), 0)                              AS cantidad_vendida,
         COALESCE(SUM(oi.unit_price * oi.quantity), 0)             AS total_ventas,
         COALESCE(SUM(oi.unit_cost * oi.quantity), 0)              AS total_costo
       FROM order_items oi
       INNER JOIN products p   ON p.id = oi.product_id
       INNER JOIN orders o     ON o.id = oi.order_id
       WHERE o.tenant_id = ?
         AND DATE(o.archived_at) BETWEEN ? AND ?
         AND oi.unit_cost IS NOT NULL
         ${branchFilter}
       GROUP BY p.id, p.name
       ORDER BY total_ventas DESC
       LIMIT 20`,
      baseParams,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT
         DATE(o.archived_at)                                         AS fecha,
         COALESCE(SUM(o.total), 0)                                  AS total_ventas,
         COALESCE(SUM(oi.unit_cost * oi.quantity), 0)              AS total_costo
       FROM orders o
       INNER JOIN order_items oi ON oi.order_id = o.id AND oi.tenant_id = o.tenant_id
       WHERE o.tenant_id = ?
         AND DATE(o.archived_at) BETWEEN ? AND ?
         AND oi.unit_cost IS NOT NULL
         ${branchFilter}
       GROUP BY DATE(o.archived_at)
       ORDER BY fecha ASC`,
      baseParams,
    ),
  ]);

  const t = totalesRows[0][0];
  const totalVentas = num(t?.total_ventas);
  const totalCosto = num(t?.total_costo);
  const margenBruto = totalVentas - totalCosto;
  const margenPct =
    totalVentas > 0
      ? Math.round((margenBruto / totalVentas) * 10000) / 100
      : 0;
  const foodCostPct =
    totalVentas > 0
      ? Math.round((totalCosto / totalVentas) * 10000) / 100
      : 0;

  const porProducto: RentabilidadProducto[] = porProductoRows[0].map((r) => {
    const tv = num(r.total_ventas);
    const tc = num(r.total_costo);
    const mg = tv - tc;
    return {
      productoId: String(r.producto_id),
      productoNombre: String(r.producto_nombre),
      cantidadVendida: num(r.cantidad_vendida),
      totalVentas: tv,
      totalCosto: tc,
      margenPct: tv > 0 ? Math.round((mg / tv) * 10000) / 100 : 0,
      foodCostPct: tv > 0 ? Math.round((tc / tv) * 10000) / 100 : 0,
    };
  });

  const porDia: RentabilidadDia[] = porDiaRows[0].map((r) => {
    const tv = num(r.total_ventas);
    const tc = num(r.total_costo);
    const mg = tv - tc;
    return {
      fecha: r.fecha instanceof Date
        ? r.fecha.toISOString().slice(0, 10)
        : String(r.fecha).slice(0, 10),
      totalVentas: tv,
      totalCosto: tc,
      margenPct: tv > 0 ? Math.round((mg / tv) * 10000) / 100 : 0,
    };
  });

  return {
    desde,
    hasta,
    totalVentas,
    totalCosto,
    margenBruto,
    margenPct,
    foodCostPct,
    porProducto,
    porDia,
  };
}
