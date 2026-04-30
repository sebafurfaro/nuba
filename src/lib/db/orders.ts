import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { pool } from "@/lib/db";
import {
  calculateRecipeCost,
  deductStockFromOrderWithConnection,
} from "@/lib/db/recipes";
import type {
  AddOrderItemInput,
  CloseOrderPaymentInput,
  CreateOrderInput,
  Location,
  LocationType,
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
} from "@/types/order";

function asIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function num(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapDbBool(value: unknown): boolean {
  if (value === true || value === 1) {
    return true;
  }
  if (value === false || value === 0 || value === null || value === undefined) {
    return false;
  }
  if (typeof value === "bigint") {
    return value !== BigInt(0);
  }
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes";
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return value.length > 0 && value[0] !== 0;
  }
  return Boolean(value);
}

function mapLocationType(raw: unknown): LocationType {
  const s = String(raw ?? "").toLowerCase();
  if (
    s === "table" ||
    s === "counter" ||
    s === "takeaway" ||
    s === "delivery" ||
    s === "online"
  ) {
    return s;
  }
  return "table";
}

/** `orders.type` en MySQL solo admite mesa | takeaway | delivery */
function orderTypeToDb(t: OrderType): "mesa" | "takeaway" | "delivery" {
  if (t === "takeaway") {
    return "takeaway";
  }
  if (t === "delivery") {
    return "delivery";
  }
  return "mesa";
}

function orderTypeFromDb(raw: unknown): OrderType {
  const s = String(raw ?? "");
  if (s === "takeaway") {
    return "takeaway";
  }
  if (s === "delivery") {
    return "delivery";
  }
  return "dine_in";
}

function legacyStatusFromKey(key: string): string {
  switch (key) {
    case "pedido":
    case "pending":
      return "pendiente";
    case "in_progress":
      return "en_proceso";
    case "ready":
      return "listo";
    case "pagado":
    case "delivered":
    case "closed":
      return "entregado";
    case "cancelled":
      return "cancelado";
    default:
      return "pendiente";
  }
}

function mapLocation(row: RowDataPacket, activeOrders?: Order[]): Location {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    branch_id: (row.branch_id as string | null) ?? null,
    table_id: (row.table_id as string | null) ?? null,
    type: mapLocationType(row.type),
    name: String(row.name),
    capacity: row.capacity == null ? null : num(row.capacity),
    is_active: mapDbBool(row.is_active),
    is_reservable: mapDbBool(row.is_reservable),
    accepts_queue: mapDbBool(row.accepts_queue),
    sort_order: num(row.sort_order),
    ...(activeOrders !== undefined ? { active_orders: activeOrders } : {}),
  };
}

function mapOrderStatus(row: RowDataPacket): OrderStatus {
  const rowKey = row["key"] as unknown;
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    key: String(rowKey),
    label: String(row.label),
    color: String(row.color),
    sort_order: num(row.sort_order),
    triggers_stock: mapDbBool(row.triggers_stock),
    is_terminal: mapDbBool(row.is_terminal),
    is_cancellable: mapDbBool(row.is_cancellable),
  };
}

function mapOrderItem(row: RowDataPacket): OrderItem {
  return {
    id: row.id as string,
    order_id: row.order_id as string,
    product_id: (row.product_id as string | null) ?? null,
    variant_id: (row.variant_id as string | null) ?? null,
    name: String(row.name),
    unit_price: num(row.unit_price),
    quantity: num(row.quantity),
    subtotal: num(row.subtotal),
    notes: (row.notes as string | null) ?? null,
  };
}

function mapOrderBase(
  row: RowDataPacket,
  items: OrderItem[],
  location?: Location,
  status?: OrderStatus,
): Order {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    location_id: (row.location_id as string | null) ?? null,
    ...(location ? { location } : {}),
    table_id: (row.table_id as string | null) ?? null,
    customer_id: (row.customer_id as string | null) ?? null,
    customer_name: (row.customer_name as string | null) ?? null,
    customer_phone: (row.customer_phone as string | null) ?? null,
    delivery_address: (row.delivery_address as string | null) ?? null,
    user_id: (row.user_id as string | null) ?? null,
    status_key: String(row.status_key),
    ...(status ? { status } : {}),
    type: orderTypeFromDb(row.type),
    subtotal: num(row.subtotal),
    discount: num(row.discount),
    tax: num(row.tax),
    total: num(row.total),
    notes: (row.notes as string | null) ?? null,
    items,
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
  };
}

async function countActiveOrdersAtLocationConn(
  conn: PoolConnection,
  tenantId: string,
  locationId: string,
): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM orders o
     INNER JOIN order_statuses os
       ON os.tenant_id = o.tenant_id AND os.\`key\` = o.status_key
     WHERE o.tenant_id = ? AND o.location_id = ? AND os.is_terminal = FALSE`,
    [tenantId, locationId],
  );
  return num(rows[0]?.c);
}

async function recalcOrderTotals(
  conn: PoolConnection,
  tenantId: string,
  orderId: string,
): Promise<void> {
  const [sumRows] = await conn.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(subtotal), 0) AS s FROM order_items
     WHERE tenant_id = ? AND order_id = ?`,
    [tenantId, orderId],
  );
  const subtotal = num(sumRows[0]?.s);
  const discount = 0;
  const tax = 0;
  const total = subtotal - discount + tax;
  await conn.query<ResultSetHeader>(
    `UPDATE orders SET subtotal = ?, discount = ?, tax = ?, total = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND tenant_id = ?`,
    [subtotal, discount, tax, total, orderId, tenantId],
  );
}

async function fetchOrderStatusByKey(
  conn: PoolConnection,
  tenantId: string,
  key: string,
): Promise<OrderStatus | null> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, tenant_id, \`key\`, label, color, sort_order, triggers_stock, is_terminal, is_cancellable
     FROM order_statuses WHERE tenant_id = ? AND \`key\` = ? LIMIT 1`,
    [tenantId, key],
  );
  const r = rows[0];
  return r ? mapOrderStatus(r) : null;
}

async function orderIsTerminal(
  conn: PoolConnection,
  tenantId: string,
  orderId: string,
): Promise<boolean> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT os.is_terminal
     FROM orders o
     INNER JOIN order_statuses os
       ON os.tenant_id = o.tenant_id AND os.\`key\` = o.status_key
     WHERE o.id = ? AND o.tenant_id = ?
     LIMIT 1`,
    [orderId, tenantId],
  );
  if (!rows.length) {
    return false;
  }
  return mapDbBool(rows[0]!.is_terminal);
}

async function loadOrderItems(
  conn: PoolConnection,
  tenantId: string,
  orderId: string,
): Promise<OrderItem[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT oi.id, oi.order_id, oi.product_id, oi.variant_id, oi.name, oi.unit_price,
            oi.quantity, oi.subtotal, oi.notes
     FROM order_items oi
     WHERE oi.tenant_id = ? AND oi.order_id = ?
     ORDER BY oi.id ASC`,
    [tenantId, orderId],
  );
  return rows.map(mapOrderItem);
}

async function hydrateOrder(
  conn: PoolConnection,
  tenantId: string,
  row: RowDataPacket,
): Promise<Order> {
  const items = await loadOrderItems(conn, tenantId, row.id as string);
  let location: Location | undefined;
  if (row.location_id) {
    const [lr] = await conn.query<RowDataPacket[]>(
      `SELECT * FROM locations WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [row.location_id, tenantId],
    );
    if (lr[0]) {
      location = mapLocation(lr[0]!);
    }
  }
  const [sr] = await conn.query<RowDataPacket[]>(
    `SELECT id, tenant_id, \`key\`, label, color, sort_order, triggers_stock, is_terminal, is_cancellable
     FROM order_statuses WHERE tenant_id = ? AND \`key\` = ? LIMIT 1`,
    [tenantId, row.status_key],
  );
  const status = sr[0] ? mapOrderStatus(sr[0]!) : undefined;
  return mapOrderBase(row, items, location, status);
}

export async function getLocations(
  tenantId: string,
  filters?: { branchId?: string; type?: LocationType },
): Promise<Location[]> {
  let sql = `SELECT l.* FROM locations l WHERE l.tenant_id = ? AND l.is_active = TRUE`;
  const params: string[] = [tenantId];
  if (filters?.branchId) {
    sql += ` AND (l.branch_id = ? OR l.branch_id IS NULL)`;
    params.push(filters.branchId);
  }
  if (filters?.type) {
    sql += ` AND l.type = ?`;
    params.push(filters.type);
  }
  sql += ` ORDER BY l.sort_order ASC, l.name ASC`;
  const [locRows] = await pool.query<RowDataPacket[]>(sql, params);

  if (!locRows.length) {
    return [];
  }

  const locationIds = locRows.map((r) => r.id as string);
  const ordersByLocation = new Map<string, Order[]>();

  try {
    // Query bulk: órdenes activas + su status por JOIN, filtradas a las
    // ubicaciones visibles (respeta los filtros de branch/type aplicados arriba).
    const locPlaceholders = locationIds.map(() => "?").join(",");
    const [orderRows] = await pool.query<RowDataPacket[]>(
      `SELECT o.id, o.tenant_id, o.location_id, o.table_id, o.customer_id, o.customer_name,
              o.customer_phone, o.delivery_address, o.user_id, o.status_key, o.type,
              o.subtotal, o.discount, o.tax, o.total, o.notes, o.created_at, o.updated_at,
              os.id              AS os_id,
              os.label           AS os_label,
              os.color           AS os_color,
              os.sort_order      AS os_sort_order,
              os.triggers_stock  AS os_triggers_stock,
              os.is_terminal     AS os_is_terminal,
              os.is_cancellable  AS os_is_cancellable
       FROM orders o
       INNER JOIN order_statuses os
         ON os.tenant_id = o.tenant_id AND os.\`key\` = o.status_key
       WHERE o.tenant_id = ?
         AND os.is_terminal = FALSE
         AND o.location_id IN (${locPlaceholders})
       ORDER BY o.created_at ASC`,
      [tenantId, ...locationIds],
    );

    if (orderRows.length) {
      // Query bulk: todos los ítems de esas órdenes en un solo viaje.
      const orderIds = orderRows.map((r) => r.id as string);
      const itemPlaceholders = orderIds.map(() => "?").join(",");
      const [itemRows] = await pool.query<RowDataPacket[]>(
        `SELECT oi.id, oi.order_id, oi.product_id, oi.variant_id, oi.name, oi.unit_price,
                oi.quantity, oi.subtotal, oi.notes
         FROM order_items oi
         WHERE oi.tenant_id = ? AND oi.order_id IN (${itemPlaceholders})
         ORDER BY oi.id ASC`,
        [tenantId, ...orderIds],
      );

      const itemsByOrder = new Map<string, OrderItem[]>();
      for (const ir of itemRows) {
        const oid = ir.order_id as string;
        const list = itemsByOrder.get(oid) ?? [];
        list.push(mapOrderItem(ir));
        itemsByOrder.set(oid, list);
      }

      for (const or of orderRows) {
        const locId = or.location_id as string | null;
        if (!locId) {
          continue;
        }
        const items = itemsByOrder.get(or.id as string) ?? [];
        const status: OrderStatus = {
          id: or.os_id as string,
          tenant_id: or.tenant_id as string,
          key: String(or.status_key),
          label: String(or.os_label),
          color: String(or.os_color),
          sort_order: num(or.os_sort_order),
          triggers_stock: mapDbBool(or.os_triggers_stock),
          is_terminal: mapDbBool(or.os_is_terminal),
          is_cancellable: mapDbBool(or.os_is_cancellable),
        };
        const order = mapOrderBase(or, items, undefined, status);
        const list = ordersByLocation.get(locId) ?? [];
        list.push(order);
        ordersByLocation.set(locId, list);
      }
    }
  } catch (e) {
    console.warn(
      "[getLocations] sin preview de órdenes activas (¿falta order_statuses o columnas en orders?)",
      e,
    );
  }

  return locRows.map((r) =>
    mapLocation(r, ordersByLocation.get(r.id as string) ?? []),
  );
}

export async function getLocationById(
  tenantId: string,
  id: string,
): Promise<Location | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM locations WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [id, tenantId],
  );
  const r = rows[0];
  if (!r) {
    return null;
  }
  const conn = await pool.getConnection();
  try {
    const [activeRows] = await conn.query<RowDataPacket[]>(
      `SELECT o.id, o.tenant_id, o.location_id, o.table_id, o.customer_id, o.customer_name,
              o.customer_phone, o.delivery_address, o.user_id, o.status_key, o.type,
              o.subtotal, o.discount, o.tax, o.total, o.notes, o.created_at, o.updated_at
       FROM orders o
       INNER JOIN order_statuses os
         ON os.tenant_id = o.tenant_id AND os.\`key\` = o.status_key
       WHERE o.tenant_id = ? AND o.location_id = ? AND os.is_terminal = FALSE`,
      [tenantId, id],
    );
    const activeOrders: Order[] = [];
    for (const or of activeRows) {
      activeOrders.push(await hydrateOrder(conn, tenantId, or));
    }
    return mapLocation(r, activeOrders);
  } finally {
    conn.release();
  }
}

export async function getOrderStatuses(tenantId: string): Promise<OrderStatus[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, tenant_id, \`key\`, label, color, sort_order, triggers_stock, is_terminal, is_cancellable
     FROM order_statuses WHERE tenant_id = ? ORDER BY sort_order ASC, \`key\` ASC`,
    [tenantId],
  );
  return rows.map(mapOrderStatus);
}

export async function getOrders(
  tenantId: string,
  filters?: {
    location_id?: string;
    status_key?: string;
    type?: OrderType;
  },
  includeTerminal = false,
): Promise<Order[]> {
  let sql: string;
  const params: unknown[] = [tenantId];
  if (includeTerminal) {
    sql = `SELECT o.* FROM orders o WHERE o.tenant_id = ?`;
    if (filters?.location_id) {
      sql += ` AND o.location_id = ?`;
      params.push(filters.location_id);
    }
    if (filters?.status_key) {
      sql += ` AND o.status_key = ?`;
      params.push(filters.status_key);
    }
    if (filters?.type) {
      sql += ` AND o.type = ?`;
      params.push(orderTypeToDb(filters.type));
    }
    sql += ` ORDER BY o.created_at DESC`;
  } else {
    sql = `SELECT o.* FROM orders o
           INNER JOIN order_statuses os
             ON os.tenant_id = o.tenant_id AND os.\`key\` = o.status_key
           WHERE o.tenant_id = ? AND os.is_terminal = FALSE`;
    if (filters?.location_id) {
      sql += ` AND o.location_id = ?`;
      params.push(filters.location_id);
    }
    if (filters?.status_key) {
      sql += ` AND o.status_key = ?`;
      params.push(filters.status_key);
    }
    if (filters?.type) {
      sql += ` AND o.type = ?`;
      params.push(orderTypeToDb(filters.type));
    }
    sql += ` ORDER BY o.created_at DESC`;
  }
  const [orderRows] = await pool.query<RowDataPacket[]>(sql, params);
  const conn = await pool.getConnection();
  try {
    const out: Order[] = [];
    for (const row of orderRows) {
      out.push(await hydrateOrder(conn, tenantId, row));
    }
    return out;
  } finally {
    conn.release();
  }
}

export async function getActiveOrders(
  tenantId: string,
  filters?: {
    location_id?: string;
    status_key?: string;
    type?: OrderType;
  },
): Promise<Order[]> {
  return getOrders(tenantId, filters, false);
}

export async function getOrderById(
  tenantId: string,
  id: string,
): Promise<Order | null> {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT o.* FROM orders o WHERE o.id = ? AND o.tenant_id = ? LIMIT 1`,
      [id, tenantId],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return hydrateOrder(conn, tenantId, row);
  } finally {
    conn.release();
  }
}

export async function createOrder(
  tenantId: string,
  userId: string | null,
  data: CreateOrderInput,
): Promise<Order> {
  if (!data.items.length) {
    throw new Error("La orden debe tener al menos un ítem");
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let branchId: string | null = null;
    let tableId: string | null = null;
    let locationId: string | null = data.location_id ?? null;
    if (locationId) {
      const [lr] = await conn.query<RowDataPacket[]>(
        `SELECT branch_id, table_id, accepts_queue FROM locations WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [locationId, tenantId],
      );
      if (!lr.length) {
        throw new Error("Location no encontrada");
      }
      branchId = (lr[0]!.branch_id as string | null) ?? null;
      tableId = (lr[0]!.table_id as string | null) ?? null;
      const acceptsQueue = mapDbBool(lr[0]!.accepts_queue);
      if (!acceptsQueue) {
        const activeCount = await countActiveOrdersAtLocationConn(
          conn,
          tenantId,
          locationId,
        );
        if (activeCount > 0) {
          throw new Error("La ubicación ya tiene una orden activa");
        }
      }
    }
    const orderId = crypto.randomUUID();
    const dbType = orderTypeToDb(data.type);

    const initialStatusKey = "pedido";
    const initialStatusLegacy = legacyStatusFromKey(initialStatusKey);

    const [ins] = await conn.query<ResultSetHeader>(
      `INSERT INTO orders (
        id, tenant_id, location_id, branch_id, table_id, customer_id, user_id,
        status, status_key, customer_name, customer_phone, delivery_address,
        type, subtotal, discount, tax, total, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?)`,
      [
        orderId,
        tenantId,
        locationId,
        branchId,
        tableId,
        data.customer_id ?? null,
        userId,
        initialStatusLegacy,
        initialStatusKey,
        data.customer_name ?? null,
        data.customer_phone ?? null,
        data.delivery_address ?? null,
        dbType,
        data.notes ?? null,
      ],
    );
    if (ins.affectedRows !== 1) {
      throw new Error("No se pudo crear la orden");
    }
    for (const line of data.items) {
      const itemId = crypto.randomUUID();
      // Validar disponibilidad en la sucursal y obtener precio efectivo (Modelo C)
      const [pr] = await conn.query<RowDataPacket[]>(
        `SELECT p.name,
                COALESCE(bp.price_override, p.price) AS effective_price,
                p.track_stock, p.stock
         FROM products p
         LEFT JOIN branch_products bp
           ON bp.product_id = p.id AND bp.branch_id = ?
         WHERE p.id = ? AND p.tenant_id = ?
           AND p.is_active = TRUE
           AND (p.is_global = TRUE OR bp.branch_id IS NOT NULL)
           AND COALESCE(bp.is_active, TRUE) = TRUE
         LIMIT 1`,
        [branchId, line.product_id, tenantId],
      );
      if (!pr.length) {
        throw new Error(`Producto no encontrado: ${line.product_id}`);
      }
      let unitPrice = num(pr[0]!.effective_price);
      let name = String(pr[0]!.name);
      if (line.variant_id) {
        const [vr] = await conn.query<RowDataPacket[]>(
          `SELECT name, price FROM product_variants WHERE id = ? AND product_id = ? AND tenant_id = ? LIMIT 1`,
          [line.variant_id, line.product_id, tenantId],
        );
        if (!vr.length) {
          throw new Error(`Variación no encontrada: ${line.variant_id}`);
        }
        name = `${name} — ${String(vr[0]!.name)}`;
        const vp = vr[0]!.price;
        if (vp != null) {
          unitPrice = num(vp);
        }
      }
      const qty = Math.max(1, num(line.quantity));
      const subtotal = Math.round(unitPrice * qty * 100) / 100;
      await conn.query<ResultSetHeader>(
        `INSERT INTO order_items (id, tenant_id, order_id, product_id, variant_id, name, unit_price, quantity, subtotal, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          itemId,
          tenantId,
          orderId,
          line.product_id,
          line.variant_id ?? null,
          name,
          unitPrice,
          qty,
          subtotal,
          line.notes ?? null,
        ],
      );
    }
    await recalcOrderTotals(conn, tenantId, orderId);
    await conn.commit();
    const created = await getOrderById(tenantId, orderId);
    if (!created) {
      throw new Error("Orden creada pero no legible");
    }
    return created;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function updateOrderStatus(
  tenantId: string,
  orderId: string,
  statusKey: string,
): Promise<Order> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [curRows] = await conn.query<RowDataPacket[]>(
      `SELECT o.id, o.status_key, o.location_id, cur_os.is_terminal AS current_is_terminal
       FROM orders o
       INNER JOIN order_statuses cur_os
         ON cur_os.tenant_id = o.tenant_id AND cur_os.\`key\` = o.status_key
       WHERE o.id = ? AND o.tenant_id = ?
       LIMIT 1`,
      [orderId, tenantId],
    );
    if (!curRows.length) {
      throw new Error("Orden no encontrada");
    }
    if (mapDbBool(curRows[0]!.current_is_terminal)) {
      throw new Error("La orden ya está en un estado terminal");
    }
    const newStatus = await fetchOrderStatusByKey(conn, tenantId, statusKey);
    if (!newStatus) {
      throw new Error("Estado no válido para este comercio");
    }
    const legacy = legacyStatusFromKey(statusKey);
    await conn.query<ResultSetHeader>(
      `UPDATE orders SET status_key = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`,
      [statusKey, legacy, orderId, tenantId],
    );
    if (newStatus.triggers_stock) {
      await deductStockFromOrderWithConnection(conn, tenantId, orderId);
    }
    if (newStatus.is_terminal) {
      const locId = curRows[0]!.location_id as string | null;
      if (locId) {
        const [locRows] = await conn.query<RowDataPacket[]>(
          `SELECT accepts_queue FROM locations WHERE id = ? AND tenant_id = ? LIMIT 1`,
          [locId, tenantId],
        );
        const acceptsQueue = locRows[0]
          ? mapDbBool(locRows[0]!.accepts_queue)
          : false;
        if (!acceptsQueue) {
          await conn.query<ResultSetHeader>(
            `UPDATE orders SET location_id = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND tenant_id = ?`,
            [orderId, tenantId],
          );
        }
      }
    }
    await conn.commit();
    const updated = await getOrderById(tenantId, orderId);
    if (!updated) {
      throw new Error("Orden no encontrada tras actualizar");
    }
    return updated;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function addOrderItem(
  tenantId: string,
  orderId: string,
  item: AddOrderItemInput,
): Promise<OrderItem> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (await orderIsTerminal(conn, tenantId, orderId)) {
      throw new Error("No se pueden agregar ítems a una orden cerrada");
    }
    const itemId = crypto.randomUUID();
    const [pr] = await conn.query<RowDataPacket[]>(
      `SELECT name, price FROM products WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [item.product_id, tenantId],
    );
    if (!pr.length) {
      throw new Error(`Producto no encontrado: ${item.product_id}`);
    }
    let unitPrice = num(pr[0]!.price);
    let name = String(pr[0]!.name);
    if (item.variant_id) {
      const [vr] = await conn.query<RowDataPacket[]>(
        `SELECT name, price FROM product_variants WHERE id = ? AND product_id = ? AND tenant_id = ? LIMIT 1`,
        [item.variant_id, item.product_id, tenantId],
      );
      if (!vr.length) {
        throw new Error(`Variación no encontrada: ${item.variant_id}`);
      }
      name = `${name} — ${String(vr[0]!.name)}`;
      const vp = vr[0]!.price;
      if (vp != null) {
        unitPrice = num(vp);
      }
    }
    const qty = Math.max(1, num(item.quantity));
    const subtotal = Math.round(unitPrice * qty * 100) / 100;
    await conn.query<ResultSetHeader>(
      `INSERT INTO order_items (id, tenant_id, order_id, product_id, variant_id, name, unit_price, quantity, subtotal, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        itemId,
        tenantId,
        orderId,
        item.product_id,
        item.variant_id ?? null,
        name,
        unitPrice,
        qty,
        subtotal,
        item.notes ?? null,
      ],
    );
    await recalcOrderTotals(conn, tenantId, orderId);
    await conn.commit();
    const [ir] = await pool.query<RowDataPacket[]>(
      `SELECT id, order_id, product_id, variant_id, name, unit_price, quantity, subtotal, notes
       FROM order_items WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [itemId, tenantId],
    );
    const row = ir[0];
    if (!row) {
      throw new Error("Ítem no encontrado tras insertar");
    }
    return mapOrderItem(row);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function removeOrderItem(
  tenantId: string,
  orderId: string,
  itemId: string,
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (await orderIsTerminal(conn, tenantId, orderId)) {
      throw new Error("No se pueden quitar ítems de una orden cerrada");
    }
    const [del] = await conn.query<ResultSetHeader>(
      `DELETE FROM order_items WHERE id = ? AND order_id = ? AND tenant_id = ?`,
      [itemId, orderId, tenantId],
    );
    if (del.affectedRows !== 1) {
      throw new Error("Ítem no encontrado");
    }
    await recalcOrderTotals(conn, tenantId, orderId);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function deleteOrder(
  tenantId: string,
  orderId: string,
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Verificar que la orden existe y no es terminal
    const [ordRows] = await conn.query<RowDataPacket[]>(
      `SELECT o.id FROM orders o
       INNER JOIN order_statuses os
         ON os.tenant_id = o.tenant_id AND os.\`key\` = o.status_key
       WHERE o.id = ? AND o.tenant_id = ? AND os.is_terminal = FALSE
       LIMIT 1`,
      [orderId, tenantId],
    );
    if (!ordRows.length) {
      throw new Error("Orden no encontrada o ya está en estado terminal");
    }
    await conn.query<ResultSetHeader>(
      `DELETE FROM order_items WHERE order_id = ? AND tenant_id = ?`,
      [orderId, tenantId],
    );
    await conn.query<ResultSetHeader>(
      `DELETE FROM orders WHERE id = ? AND tenant_id = ?`,
      [orderId, tenantId],
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function snapshotOrderCosts(
  tenantId: string,
  orderId: string,
): Promise<void> {
  const [itemRows] = await pool.query<RowDataPacket[]>(
    `SELECT oi.id, oi.product_id FROM order_items oi
     WHERE oi.tenant_id = ? AND oi.order_id = ?`,
    [tenantId, orderId],
  );
  if (!itemRows.length) {
    return;
  }
  const recipeCache = new Map<string, number | null>();
  for (const item of itemRows) {
    const productId = item.product_id as string | null;
    if (!productId) {
      continue;
    }
    let unitCost: number | null = null;
    if (!recipeCache.has(productId)) {
      const [prodRows] = await pool.query<RowDataPacket[]>(
        `SELECT recipe_id FROM products WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [productId, tenantId],
      );
      const recipeId = (prodRows[0]?.recipe_id as string | null) ?? null;
      if (recipeId) {
        try {
          const costs = await calculateRecipeCost(tenantId, recipeId);
          recipeCache.set(productId, costs.cost_per_portion);
          unitCost = costs.cost_per_portion;
        } catch {
          recipeCache.set(productId, null);
        }
      } else {
        recipeCache.set(productId, null);
      }
    } else {
      unitCost = recipeCache.get(productId) ?? null;
    }
    if (unitCost !== null) {
      await pool.query<ResultSetHeader>(
        `UPDATE order_items SET unit_cost = ? WHERE id = ? AND tenant_id = ?`,
        [unitCost, item.id as string, tenantId],
      );
    }
  }
}

export async function closeOrder(
  tenantId: string,
  orderId: string,
  paymentData: CloseOrderPaymentInput,
  options?: { reusePaymentId?: string },
): Promise<Order> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [ordRows] = await conn.query<RowDataPacket[]>(
      `SELECT o.id, o.location_id, o.total, o.status_key
       FROM orders o
       INNER JOIN order_statuses os
         ON os.tenant_id = o.tenant_id AND os.\`key\` = o.status_key
       WHERE o.id = ? AND o.tenant_id = ? AND os.is_terminal = FALSE
       LIMIT 1`,
      [orderId, tenantId],
    );
    if (!ordRows.length) {
      throw new Error("Orden no encontrada o ya cerrada");
    }
    const closedKey = "pagado";
    const legacy = legacyStatusFromKey(closedKey);
    await conn.query<ResultSetHeader>(
      `UPDATE orders SET status_key = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`,
      [closedKey, legacy, orderId, tenantId],
    );
    const currency = paymentData.currency ?? "ARS";
    const metaJson =
      paymentData.metadata !== undefined && paymentData.metadata !== null
        ? JSON.stringify(paymentData.metadata)
        : null;
    if (options?.reusePaymentId) {
      const [upd] = await conn.query<ResultSetHeader>(
        `UPDATE payments SET
           mp_payment_id = COALESCE(?, mp_payment_id),
           mp_preference_id = COALESCE(?, mp_preference_id),
           method = ?,
           status = 'aprobado',
           amount = ?,
           currency = ?,
           metadata = COALESCE(?, metadata),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ? AND order_id = ?`,
        [
          paymentData.mp_payment_id ?? null,
          paymentData.mp_preference_id ?? null,
          paymentData.method,
          paymentData.amount,
          currency,
          metaJson,
          options.reusePaymentId,
          tenantId,
          orderId,
        ],
      );
      if (upd.affectedRows === 0) {
        throw new Error("Pago asociado no encontrado");
      }
    } else {
      const payId = crypto.randomUUID();
      await conn.query<ResultSetHeader>(
        `INSERT INTO payments (
        id, tenant_id, order_id, mp_payment_id, mp_preference_id, method, status, amount, currency, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, 'aprobado', ?, ?, ?)`,
        [
          payId,
          tenantId,
          orderId,
          paymentData.mp_payment_id ?? null,
          paymentData.mp_preference_id ?? null,
          paymentData.method,
          paymentData.amount,
          currency,
          metaJson,
        ],
      );
    }
    const locId = (ordRows[0]!.location_id as string | null) ?? null;
    if (locId) {
      const [locRows] = await conn.query<RowDataPacket[]>(
        `SELECT accepts_queue FROM locations WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [locId, tenantId],
      );
      const acceptsQueue = locRows[0]
        ? mapDbBool(locRows[0]!.accepts_queue)
        : false;
      if (!acceptsQueue) {
        await conn.query<ResultSetHeader>(
          `UPDATE orders SET location_id = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND tenant_id = ?`,
          [orderId, tenantId],
        );
      }
    }
    await conn.commit();
    const out = await getOrderById(tenantId, orderId);
    if (!out) {
      throw new Error("Orden no encontrada tras cerrar");
    }
    return out;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
