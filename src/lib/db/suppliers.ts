import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

import { pool } from "@/lib/db";
import type {
  CreateSupplierInput,
  Supplier,
  SupplierIngredient,
  SupplierProduct,
  SupplierWithProducts,
  UpdateSupplierInput,
  UpsertSupplierProductInput,
} from "@/types/supplier";
import { SupplierDuplicateNameError } from "@/types/supplier";

export type {
  CreateSupplierInput,
  Supplier,
  SupplierIngredient,
  SupplierProduct,
  SupplierWithProducts,
  UpdateSupplierInput,
  UpsertSupplierProductInput,
};
export { SupplierDuplicateNameError };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapDbBool(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined)
    return false;
  if (typeof value === "bigint") return value !== BigInt(0);
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes";
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return value.length > 0 && value[0] !== 0;
  }
  return Boolean(value);
}

function trimOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function mapSupplierRow(r: RowDataPacket): Supplier {
  return {
    id: String(r.id),
    tenant_id: String(r.tenant_id),
    name: String(r.name),
    contact_name: trimOrNull(r.contact_name),
    email: trimOrNull(r.email),
    phone: trimOrNull(r.phone),
    whatsapp: trimOrNull(r.whatsapp),
    address: trimOrNull(r.address),
    notes: trimOrNull(r.notes),
    is_active: mapDbBool(r.is_active),
    created_at: asIso(r.created_at),
    updated_at: asIso(r.updated_at),
    ...(r.product_count != null
      ? { product_count: Number(r.product_count) }
      : {}),
    ...(r.ingredient_count != null
      ? { ingredient_count: Number(r.ingredient_count) }
      : {}),
  };
}

function mapSupplierProductRow(r: RowDataPacket): SupplierProduct {
  const productPrice = Number(r.product_price) || 0;
  const costPrice = Number(r.cost_price) || 0;
  const margin =
    productPrice > 0
      ? ((productPrice - costPrice) / productPrice) * 100
      : 0;
  return {
    id: String(r.id),
    tenant_id: String(r.tenant_id),
    supplier_id: String(r.supplier_id),
    product_id: String(r.product_id),
    cost_price: costPrice,
    notes: trimOrNull(r.notes),
    created_at: asIso(r.created_at),
    product_name: String(r.product_name),
    product_image_url: trimOrNull(r.product_image_url),
    product_price: productPrice,
    margin: Math.round(margin * 100) / 100,
  };
}

function mapIngredientRow(r: RowDataPacket): SupplierIngredient {
  return {
    id: String(r.id),
    name: String(r.name),
    unit: String(r.unit),
    unit_cost: Number(r.unit_cost) || 0,
    stock_quantity: Number(r.stock_quantity) || 0,
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getSuppliers(
  tenantId: string,
  filters?: { search?: string; isActive?: boolean },
): Promise<Supplier[]> {
  const conditions: string[] = ["s.tenant_id = ?"];
  const params: (string | number | null | boolean)[] = [tenantId];

  if (filters?.search) {
    conditions.push(
      "(s.name LIKE ? OR s.contact_name LIKE ?)",
    );
    const like = `%${filters.search}%`;
    params.push(like, like);
  }

  if (filters?.isActive !== undefined) {
    conditions.push("s.is_active = ?");
    params.push(filters.isActive ? 1 : 0);
  }

  const where = conditions.join(" AND ");

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       s.*,
       COUNT(DISTINCT sp.product_id)  AS product_count,
       COUNT(DISTINCT i.id)           AS ingredient_count
     FROM suppliers s
     LEFT JOIN supplier_products sp ON sp.supplier_id = s.id AND sp.tenant_id = s.tenant_id
     LEFT JOIN ingredients i        ON i.supplier_id  = s.id AND i.tenant_id  = s.tenant_id
     WHERE ${where}
     GROUP BY s.id
     ORDER BY s.name ASC`,
    params,
  );

  return rows.map(mapSupplierRow);
}

export async function getSupplierById(
  tenantId: string,
  id: string,
): Promise<SupplierWithProducts | null> {
  const [[supplierRow]] = await pool.execute<RowDataPacket[]>(
    `SELECT s.*,
       COUNT(DISTINCT sp.product_id)  AS product_count,
       COUNT(DISTINCT i.id)           AS ingredient_count
     FROM suppliers s
     LEFT JOIN supplier_products sp ON sp.supplier_id = s.id AND sp.tenant_id = s.tenant_id
     LEFT JOIN ingredients i        ON i.supplier_id  = s.id AND i.tenant_id  = s.tenant_id
     WHERE s.id = ? AND s.tenant_id = ?
     GROUP BY s.id`,
    [id, tenantId],
  );

  if (!supplierRow) return null;

  const supplier = mapSupplierRow(supplierRow);

  const [productRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       sp.id, sp.tenant_id, sp.supplier_id, sp.product_id,
       sp.cost_price, sp.notes, sp.created_at,
       p.name  AS product_name,
       p.image_url AS product_image_url,
       p.price AS product_price
     FROM supplier_products sp
     JOIN products p ON p.id = sp.product_id
     WHERE sp.supplier_id = ? AND sp.tenant_id = ?
     ORDER BY p.name ASC`,
    [id, tenantId],
  );

  const [ingredientRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, name, unit, unit_cost, stock_quantity
     FROM ingredients
     WHERE supplier_id = ? AND tenant_id = ?
     ORDER BY name ASC`,
    [id, tenantId],
  );

  return {
    ...supplier,
    products: productRows.map(mapSupplierProductRow),
    ingredients: ingredientRows.map(mapIngredientRow),
  };
}

export async function createSupplier(
  tenantId: string,
  data: CreateSupplierInput,
): Promise<Supplier> {
  const name = data.name.trim();

  const [[existing]] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM suppliers WHERE tenant_id = ? AND name = ? LIMIT 1`,
    [tenantId, name],
  );
  if (existing) throw new SupplierDuplicateNameError();

  await pool.execute<ResultSetHeader>(
    `INSERT INTO suppliers
       (id, tenant_id, name, contact_name, email, phone, whatsapp, address, notes)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      name,
      trimOrNull(data.contact_name),
      trimOrNull(data.email),
      trimOrNull(data.phone),
      trimOrNull(data.whatsapp),
      trimOrNull(data.address),
      trimOrNull(data.notes),
    ],
  );

  const [[row]] = await pool.execute<RowDataPacket[]>(
    `SELECT s.*,
       0 AS product_count,
       0 AS ingredient_count
     FROM suppliers s
     WHERE s.tenant_id = ? AND s.name = ?
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [tenantId, name],
  );

  return mapSupplierRow(row);
}

export async function updateSupplier(
  tenantId: string,
  id: string,
  data: UpdateSupplierInput,
): Promise<Supplier> {
  if (data.name !== undefined) {
    const name = data.name.trim();
    const [[dup]] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM suppliers
       WHERE tenant_id = ? AND name = ? AND id <> ?
       LIMIT 1`,
      [tenantId, name, id],
    );
    if (dup) throw new SupplierDuplicateNameError();
  }

  const sets: string[] = [];
  const params: (string | number | null | boolean)[] = [];

  if (data.name !== undefined) {
    sets.push("name = ?");
    params.push(data.name.trim());
  }
  if ("contact_name" in data) {
    sets.push("contact_name = ?");
    params.push(trimOrNull(data.contact_name));
  }
  if ("email" in data) {
    sets.push("email = ?");
    params.push(trimOrNull(data.email));
  }
  if ("phone" in data) {
    sets.push("phone = ?");
    params.push(trimOrNull(data.phone));
  }
  if ("whatsapp" in data) {
    sets.push("whatsapp = ?");
    params.push(trimOrNull(data.whatsapp));
  }
  if ("address" in data) {
    sets.push("address = ?");
    params.push(trimOrNull(data.address));
  }
  if ("notes" in data) {
    sets.push("notes = ?");
    params.push(trimOrNull(data.notes));
  }
  if (data.is_active !== undefined) {
    sets.push("is_active = ?");
    params.push(data.is_active ? 1 : 0);
  }

  if (sets.length > 0) {
    params.push(id, tenantId);
    await pool.execute(
      `UPDATE suppliers SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`,
      params,
    );
  }

  const [[row]] = await pool.execute<RowDataPacket[]>(
    `SELECT s.*,
       COUNT(DISTINCT sp.product_id)  AS product_count,
       COUNT(DISTINCT i.id)           AS ingredient_count
     FROM suppliers s
     LEFT JOIN supplier_products sp ON sp.supplier_id = s.id AND sp.tenant_id = s.tenant_id
     LEFT JOIN ingredients i        ON i.supplier_id  = s.id AND i.tenant_id  = s.tenant_id
     WHERE s.id = ? AND s.tenant_id = ?
     GROUP BY s.id`,
    [id, tenantId],
  );

  return mapSupplierRow(row);
}

export async function deactivateSupplier(
  tenantId: string,
  id: string,
): Promise<void> {
  await pool.execute(
    `UPDATE suppliers SET is_active = FALSE WHERE id = ? AND tenant_id = ?`,
    [id, tenantId],
  );
}

export async function reactivateSupplier(
  tenantId: string,
  id: string,
): Promise<void> {
  await pool.execute(
    `UPDATE suppliers SET is_active = TRUE WHERE id = ? AND tenant_id = ?`,
    [id, tenantId],
  );
}

export async function upsertSupplierProduct(
  tenantId: string,
  supplierId: string,
  data: UpsertSupplierProductInput,
): Promise<SupplierProduct> {
  await pool.execute<ResultSetHeader>(
    `INSERT INTO supplier_products (id, tenant_id, supplier_id, product_id, cost_price, notes)
     VALUES (UUID(), ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       cost_price = VALUES(cost_price),
       notes      = VALUES(notes)`,
    [
      tenantId,
      supplierId,
      data.product_id,
      Number(data.cost_price),
      trimOrNull(data.notes),
    ],
  );

  const [[row]] = await pool.execute<RowDataPacket[]>(
    `SELECT
       sp.id, sp.tenant_id, sp.supplier_id, sp.product_id,
       sp.cost_price, sp.notes, sp.created_at,
       p.name      AS product_name,
       p.image_url AS product_image_url,
       p.price     AS product_price
     FROM supplier_products sp
     JOIN products p ON p.id = sp.product_id
     WHERE sp.supplier_id = ? AND sp.product_id = ? AND sp.tenant_id = ?`,
    [supplierId, data.product_id, tenantId],
  );

  return mapSupplierProductRow(row);
}

export async function removeSupplierProduct(
  tenantId: string,
  supplierId: string,
  productId: string,
): Promise<void> {
  await pool.execute(
    `DELETE FROM supplier_products
     WHERE supplier_id = ? AND product_id = ? AND tenant_id = ?`,
    [supplierId, productId, tenantId],
  );
}
