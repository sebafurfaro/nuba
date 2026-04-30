import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

import { pool } from "@/lib/db";
import type {
  CreatePurchaseOrderInput,
  PurchaseOrder,
  PurchaseOrderItem,
  StockAlertItem,
  UpdatePurchaseOrderInput,
} from "@/types/supplier";

export type {
  CreatePurchaseOrderInput,
  PurchaseOrder,
  PurchaseOrderItem,
  StockAlertItem,
  UpdatePurchaseOrderInput,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function asIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value).trim();
  return s === "" || s === "null" ? null : s;
}

function trimOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function mapItemRow(r: RowDataPacket): PurchaseOrderItem {
  return {
    id: String(r.id),
    purchase_order_id: String(r.purchase_order_id),
    ingredient_id: String(r.ingredient_id),
    ingredient_nombre: String(r.ingredient_nombre),
    ingredient_unit: String(r.ingredient_unit),
    quantity: Number(r.quantity),
    unit_price: Number(r.unit_price),
    subtotal: Number(r.subtotal),
  };
}

function mapOrderRow(
  r: RowDataPacket,
  items: PurchaseOrderItem[] = [],
): PurchaseOrder {
  return {
    id: String(r.id),
    tenant_id: String(r.tenant_id),
    supplier_id: String(r.supplier_id),
    supplier_nombre: String(r.supplier_nombre),
    status: r.status as PurchaseOrder["status"],
    expected_date: asIsoOrNull(r.expected_date),
    received_date: asIsoOrNull(r.received_date),
    notes: trimOrNull(r.notes),
    total: Number(r.total) || 0,
    item_count: Number(r.item_count) || 0,
    items,
    created_at: asIso(r.created_at),
    updated_at: asIso(r.updated_at),
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getPurchaseOrders(
  tenantId: string,
  filters?: {
    supplierId?: string;
    status?: string;
    desde?: string;
    hasta?: string;
  },
): Promise<PurchaseOrder[]> {
  const conditions: string[] = ["po.tenant_id = ?"];
  const params: (string | number | null)[] = [tenantId];

  if (filters?.supplierId) {
    conditions.push("po.supplier_id = ?");
    params.push(filters.supplierId);
  }
  if (filters?.status) {
    conditions.push("po.status = ?");
    params.push(filters.status);
  }
  if (filters?.desde) {
    conditions.push("DATE(po.created_at) >= ?");
    params.push(filters.desde);
  }
  if (filters?.hasta) {
    conditions.push("DATE(po.created_at) <= ?");
    params.push(filters.hasta);
  }

  const where = conditions.join(" AND ");

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       po.*,
       s.name AS supplier_nombre,
       COUNT(poi.id) AS item_count
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
     WHERE ${where}
     GROUP BY po.id
     ORDER BY po.created_at DESC`,
    params,
  );

  return rows.map((r) => mapOrderRow(r, []));
}

export async function getPurchaseOrderById(
  tenantId: string,
  id: string,
): Promise<PurchaseOrder | null> {
  const [[orderRow]] = await pool.execute<RowDataPacket[]>(
    `SELECT
       po.*,
       s.name AS supplier_nombre,
       COUNT(poi.id) AS item_count
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
     WHERE po.id = ? AND po.tenant_id = ?
     GROUP BY po.id`,
    [id, tenantId],
  );

  if (!orderRow) return null;

  const [itemRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       poi.id, poi.purchase_order_id, poi.ingredient_id,
       poi.quantity, poi.unit_price, poi.subtotal,
       i.name AS ingredient_nombre,
       i.unit AS ingredient_unit
     FROM purchase_order_items poi
     JOIN ingredients i ON i.id = poi.ingredient_id
     WHERE poi.purchase_order_id = ?
     ORDER BY i.name ASC`,
    [id],
  );

  return mapOrderRow(orderRow, itemRows.map(mapItemRow));
}

export async function createPurchaseOrder(
  tenantId: string,
  data: CreatePurchaseOrderInput,
): Promise<PurchaseOrder> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO purchase_orders (id, tenant_id, supplier_id, expected_date, notes, status, total)
       VALUES (UUID(), ?, ?, ?, ?, 'draft', 0)`,
      [
        tenantId,
        data.supplier_id,
        data.expected_date ?? null,
        trimOrNull(data.notes),
      ],
    );

    const [[newRow]] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM purchase_orders WHERE tenant_id = ? AND supplier_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, data.supplier_id],
    );
    const orderId = String(newRow.id);

    for (const item of data.items) {
      await conn.execute(
        `INSERT INTO purchase_order_items (id, purchase_order_id, ingredient_id, quantity, unit_price)
         VALUES (UUID(), ?, ?, ?, ?)`,
        [orderId, item.ingredient_id, Number(item.quantity), Number(item.unit_price)],
      );
    }

    await conn.execute(
      `UPDATE purchase_orders po
       SET total = (
         SELECT COALESCE(SUM(subtotal), 0)
         FROM purchase_order_items
         WHERE purchase_order_id = po.id
       )
       WHERE id = ? AND tenant_id = ?`,
      [orderId, tenantId],
    );

    await conn.commit();

    void result;

    const order = await getPurchaseOrderById(tenantId, orderId);
    return order!;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function updatePurchaseOrder(
  tenantId: string,
  id: string,
  data: UpdatePurchaseOrderInput,
): Promise<PurchaseOrder> {
  const [[existing]] = await pool.execute<RowDataPacket[]>(
    `SELECT status FROM purchase_orders WHERE id = ? AND tenant_id = ?`,
    [id, tenantId],
  );
  if (!existing) throw new Error("NOT_FOUND");

  const currentStatus = String(existing.status);

  if (
    data.items !== undefined &&
    currentStatus !== "draft"
  ) {
    throw new Error("CANNOT_EDIT_ITEMS");
  }

  if (
    data.status &&
    currentStatus === "received"
  ) {
    throw new Error("ALREADY_RECEIVED");
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    if ("expected_date" in data) {
      sets.push("expected_date = ?");
      params.push(data.expected_date ?? null);
    }
    if ("notes" in data) {
      sets.push("notes = ?");
      params.push(trimOrNull(data.notes));
    }
    if (data.status && data.status !== "received") {
      sets.push("status = ?");
      params.push(data.status);
    }

    if (sets.length > 0) {
      params.push(id, tenantId);
      await conn.execute(
        `UPDATE purchase_orders SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`,
        params,
      );
    }

    if (data.items !== undefined) {
      await conn.execute(
        `DELETE FROM purchase_order_items WHERE purchase_order_id = ?`,
        [id],
      );
      for (const item of data.items) {
        await conn.execute(
          `INSERT INTO purchase_order_items (id, purchase_order_id, ingredient_id, quantity, unit_price)
           VALUES (UUID(), ?, ?, ?, ?)`,
          [id, item.ingredient_id, Number(item.quantity), Number(item.unit_price)],
        );
      }
      await conn.execute(
        `UPDATE purchase_orders po
         SET total = (
           SELECT COALESCE(SUM(subtotal), 0)
           FROM purchase_order_items
           WHERE purchase_order_id = po.id
         )
         WHERE id = ? AND tenant_id = ?`,
        [id, tenantId],
      );
    }

    await conn.commit();

    const order = await getPurchaseOrderById(tenantId, id);
    return order!;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function receivePurchaseOrder(
  tenantId: string,
  id: string,
): Promise<{ orden: PurchaseOrder; alertasStockBajo: StockAlertItem[] }> {
  const [[existing]] = await pool.execute<RowDataPacket[]>(
    `SELECT status FROM purchase_orders WHERE id = ? AND tenant_id = ?`,
    [id, tenantId],
  );
  if (!existing) throw new Error("NOT_FOUND");

  const currentStatus = String(existing.status);
  if (currentStatus === "received") throw new Error("ALREADY_RECEIVED");
  if (currentStatus === "cancelled") throw new Error("IS_CANCELLED");

  const [itemRows] = await pool.execute<RowDataPacket[]>(
    `SELECT ingredient_id, quantity FROM purchase_order_items WHERE purchase_order_id = ?`,
    [id],
  );

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `UPDATE purchase_orders
       SET status = 'received', received_date = CURDATE()
       WHERE id = ? AND tenant_id = ?`,
      [id, tenantId],
    );

    for (const item of itemRows) {
      await conn.execute(
        `UPDATE ingredients
         SET stock_quantity = stock_quantity + ?
         WHERE id = ? AND tenant_id = ?`,
        [Number(item.quantity), String(item.ingredient_id), tenantId],
      );
    }

    await conn.commit();

    const ingredientIds = itemRows.map((r) => String(r.ingredient_id));

    let alertasStockBajo: StockAlertItem[] = [];
    if (ingredientIds.length > 0) {
      const placeholders = ingredientIds.map(() => "?").join(",");
      const [alertRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id AS ingredient_id, name AS nombre, unit, stock_quantity AS stock, stock_alert_threshold AS stock_minimo
         FROM ingredients
         WHERE id IN (${placeholders}) AND tenant_id = ?
           AND stock_alert_threshold IS NOT NULL
           AND stock_quantity < stock_alert_threshold`,
        [...ingredientIds, tenantId],
      );
      alertasStockBajo = alertRows.map((r) => ({
        ingredient_id: String(r.ingredient_id),
        nombre: String(r.nombre),
        unit: String(r.unit),
        stock: Number(r.stock),
        stock_minimo: Number(r.stock_minimo),
      }));
    }

    const orden = await getPurchaseOrderById(tenantId, id);
    return { orden: orden!, alertasStockBajo };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
