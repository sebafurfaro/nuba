import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { pool } from "@/lib/db";
import type {
  CreateCustomerInput,
  Customer,
  CustomerFavoriteProduct,
  CustomerListFilters,
  CustomerListItem,
  CustomerMetrics,
  CustomerOrdersByMonthRow,
  CustomerSummary,
  CustomerSummaryFilters,
  OrderSummaryForCustomer,
  UpdateCustomerInput,
} from "@/types/customer";
import { CustomerDuplicateError } from "@/types/customer";

export type {
  CreateCustomerInput,
  Customer,
  CustomerDetail,
  CustomerFavoriteProduct,
  CustomerListFilters,
  CustomerListItem,
  CustomerMetrics,
  CustomerOrdersByMonthRow,
  CustomerSummary,
  CustomerSummaryFilters,
  CustomerWithMetrics,
  CustomerFavoriteWithImage,
  OrderSummaryForCustomer,
  UpdateCustomerInput,
} from "@/types/customer";
export { CustomerDuplicateError } from "@/types/customer";

function asIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
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

const LOYALTY_TIERS = ["bronze", "silver", "gold", "platinum"] as const;

function parseLoyaltyTier(value: unknown): (typeof LOYALTY_TIERS)[number] {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (LOYALTY_TIERS as readonly string[]).includes(s)
    ? (s as (typeof LOYALTY_TIERS)[number])
    : "bronze";
}

const SOURCES = ["manual", "order", "onboarding", "import"] as const;

function parseCustomerSource(value: unknown): (typeof SOURCES)[number] {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (SOURCES as readonly string[]).includes(s)
    ? (s as (typeof SOURCES)[number])
    : "manual";
}

/** Evita `''` en VARCHAR/DATE (MySQL strict / DATE inválido → 500). */
function trimOrNull(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  const s = String(value).trim();
  return s === "" ? null : s;
}

/** Solo `YYYY-MM-DD` válido; cualquier otro valor → NULL. */
function dateOrNull(value: unknown): string | null {
  const s = trimOrNull(value);
  if (!s) {
    return null;
  }
  const d = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return null;
  }
  return d;
}

function mapCustomerRow(r: RowDataPacket): Customer {
  return {
    id: String(r.id),
    tenant_id: String(r.tenant_id),
    branch_id: (r.branch_id as string | null) ?? null,
    first_name: String(r.first_name),
    last_name: String(r.last_name),
    email: (r.email as string | null) ?? null,
    whatsapp: (r.whatsapp as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    dni: (r.dni as string | null) ?? null,
    birthdate: r.birthdate == null ? null : String(r.birthdate).slice(0, 10),
    address: (r.address as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    loyalty_points:
      r.loyalty_points == null ? 0 : Number(r.loyalty_points) || 0,
    loyalty_tier: parseLoyaltyTier(r.loyalty_tier),
    source: parseCustomerSource(r.source),
    is_active: mapDbBool(r.is_active),
    created_at: asIso(r.created_at),
    updated_at: asIso(r.updated_at),
  };
}

const CUSTOMER_SELECT_BASE = `SELECT
  c.id, c.tenant_id, c.branch_id, c.first_name, c.last_name, c.email, c.whatsapp, c.phone,
  c.dni, c.birthdate, c.address, c.city, c.notes, c.is_active, c.created_at, c.updated_at,
  0 AS loyalty_points,
  'bronze' AS loyalty_tier,
  'manual' AS source
  FROM customers c`;

/** Misma fila que `CUSTOMER_SELECT_BASE` si la tabla no tiene columnas `address`/`city`. */
const CUSTOMER_SELECT_BASE_LEGACY_ROW = `SELECT
  c.id, c.tenant_id, c.branch_id, c.first_name, c.last_name, c.email, c.whatsapp, c.phone,
  c.dni, c.birthdate,
  NULL AS address,
  NULL AS city,
  c.notes, c.is_active, c.created_at, c.updated_at,
  0 AS loyalty_points,
  'bronze' AS loyalty_tier,
  'manual' AS source
  FROM customers c`;

function isMissingAddressOrCityColumnError(e: unknown): boolean {
  const err = e as { errno?: number; code?: string; message?: string };
  const msg = String(err?.message ?? "");
  if (err?.errno === 1054 || err?.code === "ER_BAD_FIELD_ERROR") {
    return (
      msg.includes("address") ||
      msg.includes("city") ||
      msg.includes("'address'") ||
      msg.includes("'city'")
    );
  }
  return msg.includes("Unknown column") && (msg.includes("address") || msg.includes("city"));
}

async function assertNoDuplicateEmailOrWhatsapp(
  conn: PoolConnection,
  tenantUuid: string,
  opts: {
    email: string | null | undefined;
    whatsapp: string | null | undefined;
    excludeCustomerId?: string | null;
  },
): Promise<void> {
  const email =
    opts.email != null && String(opts.email).trim() !== ""
      ? String(opts.email).trim()
      : null;
  const wa =
    opts.whatsapp != null && String(opts.whatsapp).trim() !== ""
      ? String(opts.whatsapp).trim()
      : null;
  if (email) {
    const [er] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM customers
       WHERE tenant_id = ?
         AND email IS NOT NULL AND TRIM(email) <> ''
         AND LOWER(TRIM(email)) = LOWER(?)
         AND (? IS NULL OR id <> ?)
       LIMIT 1`,
      [tenantUuid, email, opts.excludeCustomerId ?? null, opts.excludeCustomerId ?? null],
    );
    if (er.length) {
      throw new CustomerDuplicateError();
    }
  }
  if (wa) {
    const [wr] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM customers
       WHERE tenant_id = ?
         AND whatsapp IS NOT NULL AND TRIM(whatsapp) <> ''
         AND TRIM(whatsapp) = ?
         AND (? IS NULL OR id <> ?)
       LIMIT 1`,
      [tenantUuid, wa, opts.excludeCustomerId ?? null, opts.excludeCustomerId ?? null],
    );
    if (wr.length) {
      throw new CustomerDuplicateError();
    }
  }
}

export async function getCustomers(
  tenantUuid: string,
  filters?: CustomerListFilters,
): Promise<CustomerListItem[]> {
  const activeOnly = filters?.activeOnly !== false;
  const limit = Math.min(Math.max(filters?.limit ?? 500, 1), 1000);

  const where: string[] = ["tenant_id = ?"];
  const params: unknown[] = [tenantUuid];
  if (activeOnly) {
    where.push("is_active = TRUE");
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, first_name, last_name, email, phone
     FROM customers
     WHERE ${where.join(" AND ")}
     ORDER BY last_name ASC, first_name ASC
     LIMIT ?`,
    [...params, limit],
  );

  return rows.map((r) => ({
    id: String(r.id),
    first_name: String(r.first_name),
    last_name: String(r.last_name),
    email: (r.email as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
  }));
}

export async function getCustomerById(
  tenantUuid: string,
  customerId: string,
): Promise<Customer | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `${CUSTOMER_SELECT_BASE}
     WHERE c.tenant_id = ? AND c.id = ?
     LIMIT 1`,
    [tenantUuid, customerId],
  );
  const r = rows[0];
  if (!r) {
    return null;
  }
  return mapCustomerRow(r);
}

export async function getCustomerMetrics(
  tenantUuid: string,
  customerId: string,
): Promise<CustomerMetrics> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS order_count,
       COALESCE(SUM(o.total), 0) AS total_spent,
       COALESCE(AVG(o.total), 0) AS avg_ticket,
       MAX(o.created_at) AS last_order_at,
       MIN(o.created_at) AS first_order_at
     FROM orders o
     WHERE o.tenant_id = ? AND o.customer_id = ? AND o.status <> 'cancelado'`,
    [tenantUuid, customerId],
  );
  const r = rows[0]!;
  return {
    order_count: Number(r.order_count) || 0,
    total_spent: Number(r.total_spent) || 0,
    avg_ticket: Number(r.avg_ticket) || 0,
    last_order_at: r.last_order_at == null ? null : asIso(r.last_order_at),
    first_order_at: r.first_order_at == null ? null : asIso(r.first_order_at),
  };
}

export async function getCustomerFavoriteProducts(
  tenantUuid: string,
  customerId: string,
  limit = 10,
): Promise<CustomerFavoriteProduct[]> {
  const lim = Math.min(Math.max(limit, 1), 50);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       oi.product_id AS product_id,
       MAX(oi.name) AS name,
       SUM(oi.quantity) AS quantity_sold
     FROM order_items oi
     INNER JOIN orders o ON o.id = oi.order_id AND o.tenant_id = oi.tenant_id
     WHERE oi.tenant_id = ? AND o.customer_id = ? AND o.status <> 'cancelado'
       AND oi.product_id IS NOT NULL
     GROUP BY oi.product_id
     ORDER BY quantity_sold DESC
     LIMIT ?`,
    [tenantUuid, customerId, lim],
  );
  return rows.map((r) => ({
    product_id: String(r.product_id),
    name: String(r.name),
    quantity_sold: Number(r.quantity_sold) || 0,
  }));
}

export async function getCustomerOrdersByMonth(
  tenantUuid: string,
  customerId: string,
  maxMonths = 24,
): Promise<CustomerOrdersByMonthRow[]> {
  const cap = Math.min(Math.max(maxMonths, 1), 120);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       DATE_FORMAT(o.created_at, '%Y-%m') AS month,
       COUNT(*) AS order_count,
       COALESCE(SUM(o.total), 0) AS total
     FROM orders o
     WHERE o.tenant_id = ? AND o.customer_id = ? AND o.status <> 'cancelado'
     GROUP BY DATE_FORMAT(o.created_at, '%Y-%m')
     ORDER BY month DESC
     LIMIT ?`,
    [tenantUuid, customerId, cap],
  );
  return rows.map((r) => ({
    month: String(r.month),
    order_count: Number(r.order_count) || 0,
    total: Number(r.total) || 0,
  }));
}

export async function createCustomer(
  tenantUuid: string,
  data: CreateCustomerInput,
): Promise<Customer> {
  const id = crypto.randomUUID();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertNoDuplicateEmailOrWhatsapp(conn, tenantUuid, {
      email: data.email,
      whatsapp: data.whatsapp,
    });
    await conn.query<ResultSetHeader>(
      `INSERT INTO customers (
      id, tenant_id, branch_id, first_name, last_name, email, whatsapp, phone,
      dni, birthdate, address, city, notes, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tenantUuid,
        data.branch_id ?? null,
        String(data.first_name).trim(),
        String(data.last_name).trim(),
        trimOrNull(data.email),
        trimOrNull(data.whatsapp),
        trimOrNull(data.phone),
        trimOrNull(data.dni),
        dateOrNull(data.birthdate),
        trimOrNull(data.address),
        trimOrNull(data.city),
        trimOrNull(data.notes),
        data.is_active !== false,
      ],
    );
    const [rows] = await conn.query<RowDataPacket[]>(
      `${CUSTOMER_SELECT_BASE} WHERE c.tenant_id = ? AND c.id = ? LIMIT 1`,
      [tenantUuid, id],
    );
    await conn.commit();
    const r = rows[0];
    if (!r) {
      throw new Error("Cliente creado pero no legible");
    }
    return mapCustomerRow(r);
  } catch (e) {
    await conn.rollback();
    if (!isMissingAddressOrCityColumnError(e)) {
      throw e;
    }
    try {
      await conn.beginTransaction();
      await assertNoDuplicateEmailOrWhatsapp(conn, tenantUuid, {
        email: data.email,
        whatsapp: data.whatsapp,
      });
      await conn.query<ResultSetHeader>(
        `INSERT INTO customers (
        id, tenant_id, branch_id, first_name, last_name, email, whatsapp, phone,
        dni, birthdate, notes, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          tenantUuid,
          data.branch_id ?? null,
          String(data.first_name).trim(),
          String(data.last_name).trim(),
          trimOrNull(data.email),
          trimOrNull(data.whatsapp),
          trimOrNull(data.phone),
          trimOrNull(data.dni),
          dateOrNull(data.birthdate),
          trimOrNull(data.notes),
          data.is_active !== false,
        ],
      );
      const [rowsLegacy] = await conn.query<RowDataPacket[]>(
        `${CUSTOMER_SELECT_BASE_LEGACY_ROW} WHERE c.tenant_id = ? AND c.id = ? LIMIT 1`,
        [tenantUuid, id],
      );
      await conn.commit();
      const rl = rowsLegacy[0];
      if (!rl) {
        throw new Error("Cliente creado pero no legible");
      }
      return mapCustomerRow(rl);
    } catch (e2) {
      await conn.rollback();
      throw e2;
    }
  } finally {
    conn.release();
  }
}

export async function updateCustomer(
  tenantUuid: string,
  customerId: string,
  data: UpdateCustomerInput,
): Promise<Customer> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertNoDuplicateEmailOrWhatsapp(conn, tenantUuid, {
      email: data.email,
      whatsapp: data.whatsapp,
      excludeCustomerId: customerId,
    });

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (data.branch_id !== undefined) {
      sets.push("branch_id = ?");
      vals.push(data.branch_id);
    }
    if (data.first_name !== undefined) {
      sets.push("first_name = ?");
      vals.push(data.first_name);
    }
    if (data.last_name !== undefined) {
      sets.push("last_name = ?");
      vals.push(data.last_name);
    }
    if (data.email !== undefined) {
      sets.push("email = ?");
      vals.push(data.email);
    }
    if (data.whatsapp !== undefined) {
      sets.push("whatsapp = ?");
      vals.push(data.whatsapp);
    }
    if (data.phone !== undefined) {
      sets.push("phone = ?");
      vals.push(trimOrNull(data.phone));
    }
    if (data.dni !== undefined) {
      sets.push("dni = ?");
      vals.push(trimOrNull(data.dni));
    }
    if (data.birthdate !== undefined) {
      sets.push("birthdate = ?");
      vals.push(dateOrNull(data.birthdate));
    }
    if (data.address !== undefined) {
      sets.push("address = ?");
      vals.push(trimOrNull(data.address));
    }
    if (data.city !== undefined) {
      sets.push("city = ?");
      vals.push(trimOrNull(data.city));
    }
    if (data.notes !== undefined) {
      sets.push("notes = ?");
      vals.push(trimOrNull(data.notes));
    }
    if (data.is_active !== undefined) {
      sets.push("is_active = ?");
      vals.push(data.is_active);
    }

    if (sets.length) {
      vals.push(tenantUuid, customerId);
      const [res] = await conn.query<ResultSetHeader>(
        `UPDATE customers SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND id = ?`,
        vals,
      );
      if (res.affectedRows === 0) {
        await conn.rollback();
        const cur = await getCustomerById(tenantUuid, customerId);
        if (!cur) {
          throw new Error("Cliente no encontrado");
        }
        return cur;
      }
    }

    const [rows] = await conn.query<RowDataPacket[]>(
      `${CUSTOMER_SELECT_BASE} WHERE c.tenant_id = ? AND c.id = ? LIMIT 1`,
      [tenantUuid, customerId],
    );
    await conn.commit();
    const r = rows[0];
    if (!r) {
      throw new Error("Cliente no encontrado");
    }
    return mapCustomerRow(r);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

function buildItemsPreview(firstTwoJoined: string, itemCount: number): string {
  const parts = firstTwoJoined
    .split("||")
    .map((s) => s.trim())
    .filter(Boolean);
  if (itemCount <= 0 || parts.length === 0) {
    return "";
  }
  if (itemCount === 1) {
    return parts[0]!;
  }
  if (itemCount === 2) {
    return `${parts[0]}, ${parts[1] ?? ""}`.replace(/,\s*$/, "");
  }
  const a = parts[0]!;
  const b = parts[1] ?? parts[0]!;
  const rest = itemCount - 2;
  return `${a}, ${b} y ${rest} más`;
}

/**
 * Listado con métricas por órdenes en estado terminal (`order_statuses.is_terminal = TRUE`).
 */
export async function getCustomersSummary(
  tenantUuid: string,
  filters?: CustomerSummaryFilters,
): Promise<{ data: CustomerSummary[]; total: number }> {
  const page = Math.max(filters?.page ?? 1, 1);
  const limit = Math.min(Math.max(filters?.limit ?? 20, 1), 100);
  const offset = (page - 1) * limit;
  const orderDir =
    filters?.orderDir === "asc" || filters?.orderDir === "desc"
      ? filters.orderDir
      : "desc";
  const orderBy = filters?.orderBy ?? "name";

  const where: string[] = ["c.tenant_id = ?"];
  const params: unknown[] = [tenantUuid];

  if (filters?.isActive === true) {
    where.push("c.is_active = TRUE");
  } else if (filters?.isActive === false) {
    where.push("c.is_active = FALSE");
  }

  if (filters?.branchId) {
    where.push("c.branch_id = ?");
    params.push(filters.branchId);
  }

  const search = filters?.search?.trim();
  if (search) {
    const esc = search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const like = `%${esc}%`;
    where.push(
      `(LOWER(c.first_name) LIKE LOWER(?) OR LOWER(c.last_name) LIKE LOWER(?) OR LOWER(CONCAT(c.first_name, ' ', c.last_name)) LIKE LOWER(?)
        OR (c.email IS NOT NULL AND LOWER(c.email) LIKE LOWER(?))
        OR (c.whatsapp IS NOT NULL AND LOWER(c.whatsapp) LIKE LOWER(?))
        OR (c.dni IS NOT NULL AND LOWER(c.dni) LIKE LOWER(?)))`,
    );
    params.push(like, like, like, like, like, like);
  }

  const whereSql = where.join(" AND ");

  let orderSql: string;
  switch (orderBy) {
    case "last_order_at":
      orderSql =
        orderDir === "asc"
          ? "ORDER BY COALESCE(agg.last_order_at, '1970-01-01') ASC"
          : "ORDER BY COALESCE(agg.last_order_at, '1970-01-01') DESC";
      break;
    case "total_spent":
      orderSql =
        orderDir === "asc"
          ? "ORDER BY COALESCE(agg.total_spent, 0) ASC"
          : "ORDER BY COALESCE(agg.total_spent, 0) DESC";
      break;
    case "order_count":
      orderSql =
        orderDir === "asc"
          ? "ORDER BY COALESCE(agg.order_count, 0) ASC"
          : "ORDER BY COALESCE(agg.order_count, 0) DESC";
      break;
    case "name":
    default:
      orderSql =
        orderDir === "asc"
          ? "ORDER BY c.last_name ASC, c.first_name ASC"
          : "ORDER BY c.last_name DESC, c.first_name DESC";
      break;
  }

  const aggSql = `SELECT
      o.customer_id AS customer_id,
      COUNT(o.id) AS order_count,
      COALESCE(SUM(o.total), 0) AS total_spent,
      COALESCE(AVG(o.total), 0) AS avg_ticket,
      MAX(o.created_at) AS last_order_at
    FROM orders o
    INNER JOIN order_statuses os
      ON os.tenant_id = o.tenant_id AND os.\`key\` = o.status_key AND os.is_terminal = TRUE
    WHERE o.tenant_id = ?
    GROUP BY o.customer_id`;

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM customers c WHERE ${whereSql}`,
    params,
  );
  const total = Number(countRows[0]?.total) || 0;

  const listParams = [tenantUuid, ...params, limit, offset];
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       c.id, c.tenant_id, c.branch_id, c.first_name, c.last_name, c.email, c.whatsapp, c.phone,
       c.dni, c.birthdate, c.address, c.city, c.notes, c.is_active, c.created_at, c.updated_at,
       0 AS loyalty_points,
       'bronze' AS loyalty_tier,
       'manual' AS source,
       COALESCE(agg.order_count, 0) AS order_count,
       COALESCE(agg.total_spent, 0) AS total_spent,
       COALESCE(agg.avg_ticket, 0) AS avg_ticket,
       agg.last_order_at AS last_order_at
     FROM customers c
     LEFT JOIN (${aggSql}) agg ON agg.customer_id = c.id
     WHERE ${whereSql}
     ${orderSql}
     LIMIT ? OFFSET ?`,
    listParams,
  );

  const data: CustomerSummary[] = rows.map((r) => {
    const base = mapCustomerRow(r);
    return {
      ...base,
      order_count: Number(r.order_count) || 0,
      total_spent: Number(r.total_spent) || 0,
      avg_ticket: Number(r.avg_ticket) || 0,
      last_order_at: r.last_order_at == null ? null : asIso(r.last_order_at),
    };
  });

  return { data, total };
}

/**
 * Historial de órdenes del cliente (excluye canceladas), paginado.
 */
export async function getCustomerOrderHistory(
  tenantUuid: string,
  customerId: string,
  page = 1,
  limit = 10,
): Promise<{ data: OrderSummaryForCustomer[]; total: number }> {
  const p = Math.max(page, 1);
  const lim = Math.min(Math.max(limit, 1), 100);
  const offset = (p - 1) * lim;

  const baseWhere = `o.tenant_id = ? AND o.customer_id = ? AND o.status <> 'cancelado'`;
  const baseParams: unknown[] = [tenantUuid, customerId];

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM orders o WHERE ${baseWhere}`,
    baseParams,
  );
  const total = Number(countRows[0]?.total) || 0;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       o.id,
       o.created_at,
       o.type,
       o.status_key,
       os.label AS status_label,
       os.color AS status_color,
       l.name AS location_name,
       o.total,
       COALESCE(ic.item_count, 0) AS item_count,
       COALESCE(ic.first_two, '') AS first_two
     FROM orders o
     INNER JOIN order_statuses os
       ON os.tenant_id = o.tenant_id AND os.\`key\` = o.status_key
     LEFT JOIN locations l
       ON l.id = o.location_id AND l.tenant_id = o.tenant_id
     LEFT JOIN (
       SELECT
         tenant_id,
         order_id,
         COUNT(*) AS item_count,
         SUBSTRING_INDEX(GROUP_CONCAT(name ORDER BY created_at ASC SEPARATOR '||'), '||', 2) AS first_two
       FROM order_items
       GROUP BY tenant_id, order_id
     ) ic ON ic.order_id = o.id AND ic.tenant_id = o.tenant_id
     WHERE ${baseWhere}
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    [...baseParams, lim, offset],
  );

  const data: OrderSummaryForCustomer[] = rows.map((r) => {
    const itemCount = Number(r.item_count) || 0;
    const firstTwo = String(r.first_two ?? "");
    return {
      id: String(r.id),
      created_at: asIso(r.created_at),
      type: String(r.type),
      status_key: String(r.status_key),
      status_label: String(r.status_label ?? ""),
      status_color: String(r.status_color ?? ""),
      location_name: (r.location_name as string | null) ?? null,
      total: Number(r.total) || 0,
      item_count: itemCount,
      items_preview: buildItemsPreview(firstTwo, itemCount),
    };
  });

  return { data, total };
}

export async function deleteCustomer(
  tenantUuid: string,
  id: string,
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.query<ResultSetHeader>(
      `UPDATE customers SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND id = ?`,
      [tenantUuid, id],
    );
    if (res.affectedRows === 0) {
      await conn.rollback();
      return;
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
