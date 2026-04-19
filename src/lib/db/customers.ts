import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { pool } from "@/lib/db";

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

export type CustomerListItem = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
};

export type CustomerListFilters = {
  activeOnly?: boolean;
  limit?: number;
};

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

export type CustomerDetail = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  whatsapp: string | null;
  phone: string | null;
  dni: string | null;
  birthdate: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function getCustomerById(
  tenantUuid: string,
  customerId: string,
): Promise<CustomerDetail | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, tenant_id, branch_id, first_name, last_name, email, whatsapp, phone,
            dni, birthdate, notes, is_active, created_at, updated_at
     FROM customers
     WHERE tenant_id = ? AND id = ?
     LIMIT 1`,
    [tenantUuid, customerId],
  );
  const r = rows[0];
  if (!r) {
    return null;
  }
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
    notes: (r.notes as string | null) ?? null,
    is_active: mapDbBool(r.is_active),
    created_at: asIso(r.created_at),
    updated_at: asIso(r.updated_at),
  };
}

export type CustomerMetrics = {
  order_count: number;
  total_spent: number;
  last_order_at: string | null;
};

export async function getCustomerMetrics(
  tenantUuid: string,
  customerId: string,
): Promise<CustomerMetrics> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS order_count,
       COALESCE(SUM(o.total), 0) AS total_spent,
       MAX(o.created_at) AS last_order_at
     FROM orders o
     WHERE o.tenant_id = ? AND o.customer_id = ? AND o.status <> 'cancelado'`,
    [tenantUuid, customerId],
  );
  const r = rows[0]!;
  return {
    order_count: Number(r.order_count) || 0,
    total_spent: Number(r.total_spent) || 0,
    last_order_at: r.last_order_at == null ? null : asIso(r.last_order_at),
  };
}

export type CustomerFavoriteProduct = {
  product_id: string;
  name: string;
  quantity_sold: number;
};

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

export type CustomerOrdersByMonthRow = {
  month: string;
  order_count: number;
  total: number;
};

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

export type CreateCustomerInput = {
  branch_id?: string | null;
  first_name: string;
  last_name: string;
  email?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  dni?: string | null;
  birthdate?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

export async function createCustomer(
  tenantUuid: string,
  data: CreateCustomerInput,
): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query<ResultSetHeader>(
    `INSERT INTO customers (
      id, tenant_id, branch_id, first_name, last_name, email, whatsapp, phone,
      dni, birthdate, notes, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      tenantUuid,
      data.branch_id ?? null,
      data.first_name,
      data.last_name,
      data.email ?? null,
      data.whatsapp ?? null,
      data.phone ?? null,
      data.dni ?? null,
      data.birthdate ?? null,
      data.notes ?? null,
      data.is_active !== false,
    ],
  );
  return id;
}

export type UpdateCustomerInput = {
  branch_id?: string | null;
  first_name?: string;
  last_name?: string;
  email?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  dni?: string | null;
  birthdate?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

export async function updateCustomer(
  tenantUuid: string,
  customerId: string,
  data: UpdateCustomerInput,
): Promise<{ affectedRows: number }> {
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
    vals.push(data.phone);
  }
  if (data.dni !== undefined) {
    sets.push("dni = ?");
    vals.push(data.dni);
  }
  if (data.birthdate !== undefined) {
    sets.push("birthdate = ?");
    vals.push(data.birthdate);
  }
  if (data.notes !== undefined) {
    sets.push("notes = ?");
    vals.push(data.notes);
  }
  if (data.is_active !== undefined) {
    sets.push("is_active = ?");
    vals.push(data.is_active);
  }
  if (!sets.length) {
    return { affectedRows: 0 };
  }
  vals.push(tenantUuid, customerId);
  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE customers SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND id = ?`,
    vals,
  );
  return { affectedRows: res.affectedRows };
}
