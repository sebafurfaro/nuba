import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import { pool } from "@/lib/db";
import type { LocationType } from "@/types/order";

function num(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type CreateLocationInput = {
  branch_id?: string | null;
  table_id?: string | null;
  type: LocationType;
  name: string;
  capacity?: number | null;
  is_active?: boolean;
  is_reservable?: boolean;
  accepts_queue?: boolean;
  sort_order?: number;
};

export type UpdateLocationInput = Partial<CreateLocationInput>;

export async function insertLocation(
  tenantId: string,
  input: CreateLocationInput,
): Promise<string> {
  const id = crypto.randomUUID();
  const branchId = input.branch_id ?? null;
  const tableId = input.table_id ?? null;
  if (branchId) {
    const [b] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM branches WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [branchId, tenantId],
    );
    if (!b.length) {
      throw new Error("Sucursal inválida");
    }
  }
  if (tableId) {
    const [t] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM tables WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [tableId, tenantId],
    );
    if (!t.length) {
      throw new Error("Mesa inválida");
    }
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await insertLocationRowOnConn(conn, {
      id,
      tenantId,
      branchId,
      tableId,
      type: input.type,
      name: input.name,
      capacity: input.capacity == null ? null : num(input.capacity),
      isActive: input.is_active !== undefined ? Boolean(input.is_active) : true,
      isReservable:
        input.is_reservable !== undefined ? Boolean(input.is_reservable) : false,
      acceptsQueue:
        input.accepts_queue !== undefined ? Boolean(input.accepts_queue) : false,
      sortOrder: input.sort_order != null ? num(input.sort_order) : 0,
    });
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return id;
}

export type BulkCreateLocationsInput = Omit<
  CreateLocationInput,
  "name"
> & {
  /** Texto base; se crean nombres `{prefix} 1` … `{prefix} {count}`. */
  name_prefix: string;
  count: number;
};

/**
 * Crea varias ubicaciones en una sola transacción (mismo tipo y opciones).
 */
export async function insertLocationsBulk(
  tenantId: string,
  input: BulkCreateLocationsInput,
): Promise<string[]> {
  const prefix = input.name_prefix.trim();
  if (!prefix) {
    throw new Error("Prefijo vacío");
  }
  const count = Math.floor(Number(input.count));
  if (count < 1 || count > 100) {
    throw new Error("La cantidad debe estar entre 1 y 100");
  }
  const suffixLen = String(count).length;
  if (prefix.length + 1 + suffixLen > 100) {
    throw new Error("Prefijo demasiado largo para la cantidad indicada");
  }

  const branchId = input.branch_id ?? null;
  const tableId = input.table_id ?? null;
  if (branchId) {
    const [b] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM branches WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [branchId, tenantId],
    );
    if (!b.length) {
      throw new Error("Sucursal inválida");
    }
  }
  if (tableId) {
    const [t] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM tables WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [tableId, tenantId],
    );
    if (!t.length) {
      throw new Error("Mesa inválida");
    }
  }

  const capacityVal =
    input.capacity == null ? null : num(input.capacity);
  const isActive = input.is_active !== undefined ? Boolean(input.is_active) : true;
  const isReservable =
    input.is_reservable !== undefined ? Boolean(input.is_reservable) : false;
  const acceptsQueue =
    input.accepts_queue !== undefined ? Boolean(input.accepts_queue) : false;
  const sortOrder = input.sort_order != null ? num(input.sort_order) : 0;

  const conn = await pool.getConnection();
  const ids: string[] = [];
  try {
    await conn.beginTransaction();
    for (let i = 1; i <= count; i++) {
      const name = `${prefix} ${i}`;
      const id = crypto.randomUUID();
      await insertLocationRowOnConn(conn, {
        id,
        tenantId,
        branchId,
        tableId,
        type: input.type,
        name,
        capacity: capacityVal,
        isActive,
        isReservable,
        acceptsQueue,
        sortOrder,
      });
      ids.push(id);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return ids;
}

async function insertLocationRowOnConn(
  conn: PoolConnection,
  args: {
    id: string;
    tenantId: string;
    branchId: string | null;
    tableId: string | null;
    type: LocationType;
    name: string;
    capacity: number | null;
    isActive: boolean;
    isReservable: boolean;
    acceptsQueue: boolean;
    sortOrder: number;
  },
): Promise<void> {
  await conn.query<ResultSetHeader>(
    `INSERT INTO locations (
      id, tenant_id, branch_id, table_id, type, name, capacity,
      is_active, is_reservable, accepts_queue, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      args.id,
      args.tenantId,
      args.branchId,
      args.tableId,
      args.type,
      args.name.trim(),
      args.capacity,
      args.isActive,
      args.isReservable,
      args.acceptsQueue,
      args.sortOrder,
    ],
  );
}

export async function updateLocationRow(
  tenantId: string,
  locationId: string,
  patch: UpdateLocationInput,
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.branch_id !== undefined) {
    sets.push("branch_id = ?");
    vals.push(patch.branch_id);
  }
  if (patch.table_id !== undefined) {
    sets.push("table_id = ?");
    vals.push(patch.table_id);
  }
  if (patch.type !== undefined) {
    sets.push("type = ?");
    vals.push(patch.type);
  }
  if (patch.name !== undefined) {
    sets.push("name = ?");
    vals.push(patch.name.trim());
  }
  if (patch.capacity !== undefined) {
    sets.push("capacity = ?");
    vals.push(patch.capacity == null ? null : num(patch.capacity));
  }
  if (patch.is_active !== undefined) {
    sets.push("is_active = ?");
    vals.push(patch.is_active);
  }
  if (patch.is_reservable !== undefined) {
    sets.push("is_reservable = ?");
    vals.push(patch.is_reservable);
  }
  if (patch.accepts_queue !== undefined) {
    sets.push("accepts_queue = ?");
    vals.push(patch.accepts_queue);
  }
  if (patch.sort_order !== undefined) {
    sets.push("sort_order = ?");
    vals.push(num(patch.sort_order));
  }
  if (!sets.length) {
    return;
  }
  vals.push(locationId, tenantId);
  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE locations SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND tenant_id = ?`,
    vals,
  );
  if (res.affectedRows !== 1) {
    throw new Error("Location no encontrada");
  }
}

export async function countActiveOrdersAtLocation(
  tenantId: string,
  locationId: string,
): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM orders o
     INNER JOIN order_statuses os
       ON os.tenant_id = o.tenant_id AND os.\`key\` = o.status_key
     WHERE o.tenant_id = ? AND o.location_id = ? AND os.is_terminal = FALSE`,
    [tenantId, locationId],
  );
  return num(rows[0]?.c);
}

export async function deleteLocationRow(
  tenantId: string,
  locationId: string,
): Promise<"ok" | "has_active_orders"> {
  const c = await countActiveOrdersAtLocation(tenantId, locationId);
  if (c > 0) {
    return "has_active_orders";
  }
  const [res] = await pool.query<ResultSetHeader>(
    `DELETE FROM locations WHERE id = ? AND tenant_id = ?`,
    [locationId, tenantId],
  );
  if (res.affectedRows !== 1) {
    throw new Error("Location no encontrada");
  }
  return "ok";
}

export type CreateOrderStatusInput = {
  key: string;
  label: string;
  color?: string;
  sort_order?: number;
  triggers_stock?: boolean;
  is_terminal?: boolean;
  is_cancellable?: boolean;
};

export async function insertOrderStatusRow(
  tenantId: string,
  input: CreateOrderStatusInput,
): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query<ResultSetHeader>(
    `INSERT INTO order_statuses (
      id, tenant_id, \`key\`, label, color, sort_order, triggers_stock, is_terminal, is_cancellable
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      tenantId,
      input.key.trim(),
      input.label.trim(),
      input.color?.trim() ?? "#6b7280",
      input.sort_order != null ? num(input.sort_order) : 0,
      input.triggers_stock !== undefined ? Boolean(input.triggers_stock) : false,
      input.is_terminal !== undefined ? Boolean(input.is_terminal) : false,
      input.is_cancellable !== undefined ? Boolean(input.is_cancellable) : true,
    ],
  );
  return id;
}

export type UpdateOrderStatusDefinitionInput = {
  label?: string;
  color?: string;
  sort_order?: number;
  triggers_stock?: boolean;
  is_terminal?: boolean;
};

export async function updateOrderStatusDefinition(
  tenantId: string,
  statusId: string,
  patch: UpdateOrderStatusDefinitionInput,
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.label !== undefined) {
    sets.push("label = ?");
    vals.push(patch.label.trim());
  }
  if (patch.color !== undefined) {
    sets.push("color = ?");
    vals.push(patch.color.trim());
  }
  if (patch.sort_order !== undefined) {
    sets.push("sort_order = ?");
    vals.push(num(patch.sort_order));
  }
  if (patch.triggers_stock !== undefined) {
    sets.push("triggers_stock = ?");
    vals.push(patch.triggers_stock);
  }
  if (!sets.length) {
    return;
  }
  vals.push(statusId, tenantId);
  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE order_statuses SET ${sets.join(", ")}
     WHERE id = ? AND tenant_id = ?`,
    vals,
  );
  if (res.affectedRows !== 1) {
    throw new Error("Estado no encontrado");
  }
}

export async function deleteOrderStatusRow(
  tenantId: string,
  statusId: string,
): Promise<"ok" | "in_use" | "not_found"> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT \`key\` FROM order_statuses WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [statusId, tenantId],
  );
  const row = rows[0];
  if (!row) {
    return "not_found";
  }
  const statusKey = String(row["key"]);
  const [cnt] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM orders WHERE tenant_id = ? AND status_key = ?`,
    [tenantId, statusKey],
  );
  if (num(cnt[0]?.c) > 0) {
    return "in_use";
  }
  const [res] = await pool.query<ResultSetHeader>(
    `DELETE FROM order_statuses WHERE id = ? AND tenant_id = ?`,
    [statusId, tenantId],
  );
  if (res.affectedRows !== 1) {
    return "not_found";
  }
  return "ok";
}

export async function bulkUpdateOrderStatusSortOrder(
  tenantId: string,
  items: { id: string; sort_order: number }[],
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const row of items) {
      const [res] = await conn.query<ResultSetHeader>(
        `UPDATE order_statuses SET sort_order = ? WHERE id = ? AND tenant_id = ?`,
        [num(row.sort_order), row.id, tenantId],
      );
      if (res.affectedRows !== 1) {
        throw new Error(`Estado no encontrado: ${row.id}`);
      }
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export type BranchListItem = {
  id: string;
  name: string;
};

/** Sucursales activas del tenant (slug de URL), para selects en panel. */
export async function listBranchesByTenantSlug(
  tenantSlug: string,
): Promise<BranchListItem[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT b.id, b.name
     FROM branches b
     INNER JOIN tenants t ON t.id = b.tenant_id
     WHERE t.slug = ? AND t.is_active = TRUE AND b.is_active = TRUE
     ORDER BY b.name ASC`,
    [tenantSlug],
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
  }));
}
