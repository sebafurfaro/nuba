import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

import { pool } from "@/lib/db";
import type {
  CreateIngredientAndLinkInput,
  CreateSupplierInput,
  IngredientSearchResult,
  LinkExistingIngredientInput,
  Supplier,
  SupplierIngredient,
  SupplierStats,
  SupplierWithIngredients,
  UpdateSupplierIngredientInput,
  UpdateSupplierInput,
} from "@/types/supplier";
import { SupplierDuplicateNameError } from "@/types/supplier";

export type {
  CreateIngredientAndLinkInput,
  CreateSupplierInput,
  IngredientSearchResult,
  LinkExistingIngredientInput,
  Supplier,
  SupplierIngredient,
  SupplierStats,
  SupplierWithIngredients,
  UpdateSupplierIngredientInput,
  UpdateSupplierInput,
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
    ...(r.ingredient_count != null
      ? { ingredient_count: Number(r.ingredient_count) }
      : {}),
  };
}

function mapSupplierIngredientRow(r: RowDataPacket): SupplierIngredient {
  return {
    id: String(r.id),
    tenant_id: String(r.tenant_id),
    supplier_id: String(r.supplier_id),
    ingredient_id: String(r.ingredient_id),
    ingredient_nombre: String(r.ingredient_nombre),
    ingredient_unit: String(r.ingredient_unit),
    ingredient_stock: Number(r.ingredient_stock) || 0,
    ingredient_stock_minimo: r.ingredient_stock_minimo != null ? Number(r.ingredient_stock_minimo) : null,
    purchase_unit: String(r.purchase_unit || "unidad"),
    purchase_qty: Number(r.purchase_qty) || 1,
    cost_per_purchase: Number(r.cost_per_purchase) || 0,
    unit_cost_calculated: Number(r.unit_cost_calculated) || 0,
    es_principal: mapDbBool(r.es_principal),
    initial_stock_qty: r.initial_stock_qty != null ? Number(r.initial_stock_qty) : null,
    notes: trimOrNull(r.notes),
    created_at: asIso(r.created_at),
  };
}

const SI_SELECT = `
  si.id, si.tenant_id, si.supplier_id, si.ingredient_id,
  si.purchase_unit, si.purchase_qty, si.cost_per_purchase,
  si.unit_cost_calculated, si.es_principal, si.initial_stock_qty,
  si.notes, si.created_at,
  i.name AS ingredient_nombre,
  i.unit AS ingredient_unit,
  i.stock_quantity AS ingredient_stock,
  i.stock_alert_threshold AS ingredient_stock_minimo
`;

// ─── Supplier CRUD ────────────────────────────────────────────────────────────

export async function getSuppliers(
  tenantId: string,
  filters?: { search?: string; isActive?: boolean },
): Promise<Supplier[]> {
  const conditions: string[] = ["s.tenant_id = ?"];
  const params: (string | number | null | boolean)[] = [tenantId];

  if (filters?.search) {
    conditions.push("(s.name LIKE ? OR s.contact_name LIKE ?)");
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
       COUNT(DISTINCT si.id) AS ingredient_count
     FROM suppliers s
     LEFT JOIN supplier_ingredients si ON si.supplier_id = s.id AND si.tenant_id = s.tenant_id
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
): Promise<SupplierWithIngredients | null> {
  const [[supplierRow]] = await pool.execute<RowDataPacket[]>(
    `SELECT s.*,
       COUNT(DISTINCT si.id) AS ingredient_count
     FROM suppliers s
     LEFT JOIN supplier_ingredients si ON si.supplier_id = s.id AND si.tenant_id = s.tenant_id
     WHERE s.id = ? AND s.tenant_id = ?
     GROUP BY s.id`,
    [id, tenantId],
  );

  if (!supplierRow) return null;

  const supplier = mapSupplierRow(supplierRow);

  const [siRows] = await pool.execute<RowDataPacket[]>(
    `SELECT ${SI_SELECT}
     FROM supplier_ingredients si
     JOIN ingredients i ON i.id = si.ingredient_id
     WHERE si.supplier_id = ? AND si.tenant_id = ?
     ORDER BY si.es_principal DESC, i.name ASC`,
    [id, tenantId],
  );

  return {
    ...supplier,
    supplier_ingredients: siRows.map(mapSupplierIngredientRow),
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
    `SELECT s.*, 0 AS ingredient_count
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
       COUNT(DISTINCT si.id) AS ingredient_count
     FROM suppliers s
     LEFT JOIN supplier_ingredients si ON si.supplier_id = s.id AND si.tenant_id = s.tenant_id
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

// ─── Supplier Ingredients ─────────────────────────────────────────────────────

export async function getSupplierIngredients(
  tenantId: string,
  supplierId: string,
): Promise<SupplierIngredient[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT ${SI_SELECT}
     FROM supplier_ingredients si
     JOIN ingredients i ON i.id = si.ingredient_id
     WHERE si.supplier_id = ? AND si.tenant_id = ?
     ORDER BY si.es_principal DESC, i.name ASC`,
    [supplierId, tenantId],
  );
  return rows.map(mapSupplierIngredientRow);
}

export async function createIngredientAndLink(
  tenantId: string,
  supplierId: string,
  data: CreateIngredientAndLinkInput,
): Promise<SupplierIngredient> {
  const unitCostCalculated =
    data.purchase_qty > 0 ? data.cost_per_purchase / data.purchase_qty : 0;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Insert new ingredient
    await conn.execute<ResultSetHeader>(
      `INSERT INTO ingredients
         (id, tenant_id, name, unit, unit_cost, stock_quantity, stock_alert_threshold)
       VALUES (UUID(), ?, ?, ?, ?, 0, ?)`,
      [
        tenantId,
        data.nombre.trim(),
        data.unit,
        data.es_principal ? unitCostCalculated : 0,
        data.stock_minimo != null ? Number(data.stock_minimo) : null,
      ],
    );

    const [[ingRow]] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM ingredients
       WHERE tenant_id = ? AND name = ?
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, data.nombre.trim()],
    );
    const ingredientId = String(ingRow.id);

    // 2. Demote other principal suppliers for this ingredient
    if (data.es_principal) {
      await conn.execute(
        `UPDATE supplier_ingredients SET es_principal = FALSE
         WHERE ingredient_id = ? AND tenant_id = ?`,
        [ingredientId, tenantId],
      );
    }

    // 3. Insert supplier_ingredients link
    await conn.execute<ResultSetHeader>(
      `INSERT INTO supplier_ingredients
         (id, tenant_id, supplier_id, ingredient_id,
          purchase_unit, purchase_qty, cost_per_purchase, unit_cost_calculated,
          es_principal, initial_stock_qty, notes)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId, supplierId, ingredientId,
        data.purchase_unit,
        Number(data.purchase_qty),
        Number(data.cost_per_purchase),
        unitCostCalculated,
        data.es_principal ? 1 : 0,
        data.initial_stock_qty != null ? Number(data.initial_stock_qty) : null,
        trimOrNull(data.notes),
      ],
    );

    // 4. Apply initial stock
    if (data.initial_stock_qty != null && data.initial_stock_qty > 0) {
      await conn.execute(
        `UPDATE ingredients SET stock_quantity = ? WHERE id = ? AND tenant_id = ?`,
        [Number(data.initial_stock_qty), ingredientId, tenantId],
      );
    }

    await conn.commit();

    const [[row]] = await conn.execute<RowDataPacket[]>(
      `SELECT ${SI_SELECT}
       FROM supplier_ingredients si
       JOIN ingredients i ON i.id = si.ingredient_id
       WHERE si.supplier_id = ? AND si.ingredient_id = ? AND si.tenant_id = ?`,
      [supplierId, ingredientId, tenantId],
    );

    return mapSupplierIngredientRow(row);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function linkExistingIngredient(
  tenantId: string,
  supplierId: string,
  data: LinkExistingIngredientInput,
): Promise<SupplierIngredient> {
  const unitCostCalculated =
    data.purchase_qty > 0 ? data.cost_per_purchase / data.purchase_qty : 0;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Verify ingredient belongs to tenant
    const [[ingRow]] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM ingredients WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [data.ingredient_id, tenantId],
    );
    if (!ingRow) throw new Error("INGREDIENT_NOT_FOUND");

    // 2. Verify link doesn't already exist
    const [[existing]] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM supplier_ingredients
       WHERE supplier_id = ? AND ingredient_id = ? LIMIT 1`,
      [supplierId, data.ingredient_id],
    );
    if (existing) throw new Error("ALREADY_LINKED");

    // 3. Demote other principals + update ingredient unit_cost if es_principal
    if (data.es_principal) {
      await conn.execute(
        `UPDATE supplier_ingredients SET es_principal = FALSE
         WHERE ingredient_id = ? AND tenant_id = ?`,
        [data.ingredient_id, tenantId],
      );
      await conn.execute(
        `UPDATE ingredients SET unit_cost = ? WHERE id = ? AND tenant_id = ?`,
        [unitCostCalculated, data.ingredient_id, tenantId],
      );
    }

    // 4. Insert link
    await conn.execute<ResultSetHeader>(
      `INSERT INTO supplier_ingredients
         (id, tenant_id, supplier_id, ingredient_id,
          purchase_unit, purchase_qty, cost_per_purchase, unit_cost_calculated,
          es_principal, initial_stock_qty, notes)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId, supplierId, data.ingredient_id,
        data.purchase_unit,
        Number(data.purchase_qty),
        Number(data.cost_per_purchase),
        unitCostCalculated,
        data.es_principal ? 1 : 0,
        data.initial_stock_qty != null ? Number(data.initial_stock_qty) : null,
        trimOrNull(data.notes),
      ],
    );

    // 5. Add initial stock if provided
    if (data.initial_stock_qty != null && data.initial_stock_qty > 0) {
      await conn.execute(
        `UPDATE ingredients SET stock_quantity = stock_quantity + ?
         WHERE id = ? AND tenant_id = ?`,
        [Number(data.initial_stock_qty), data.ingredient_id, tenantId],
      );
    }

    await conn.commit();

    const [[row]] = await conn.execute<RowDataPacket[]>(
      `SELECT ${SI_SELECT}
       FROM supplier_ingredients si
       JOIN ingredients i ON i.id = si.ingredient_id
       WHERE si.supplier_id = ? AND si.ingredient_id = ? AND si.tenant_id = ?`,
      [supplierId, data.ingredient_id, tenantId],
    );

    return mapSupplierIngredientRow(row);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function updateSupplierIngredient(
  tenantId: string,
  id: string,
  data: UpdateSupplierIngredientInput,
): Promise<SupplierIngredient> {
  const [[existing]] = await pool.execute<RowDataPacket[]>(
    `SELECT si.*, i.name AS ingredient_nombre, i.unit AS ingredient_unit
     FROM supplier_ingredients si
     JOIN ingredients i ON i.id = si.ingredient_id
     WHERE si.id = ? AND si.tenant_id = ?`,
    [id, tenantId],
  );
  if (!existing) throw new Error("NOT_FOUND");

  const newPurchaseQty = data.purchase_qty ?? Number(existing.purchase_qty);
  const newCostPerPurchase = data.cost_per_purchase ?? Number(existing.cost_per_purchase);
  const unitCostCalculated = newPurchaseQty > 0 ? newCostPerPurchase / newPurchaseQty : 0;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (data.es_principal === true) {
      await conn.execute(
        `UPDATE supplier_ingredients
         SET es_principal = FALSE
         WHERE ingredient_id = ? AND tenant_id = ? AND id <> ?`,
        [String(existing.ingredient_id), tenantId, id],
      );
    }

    const sets: string[] = ["unit_cost_calculated = ?"];
    const params: (string | number | null | boolean)[] = [unitCostCalculated];

    if (data.purchase_unit !== undefined) {
      sets.push("purchase_unit = ?");
      params.push(data.purchase_unit);
    }
    if (data.purchase_qty !== undefined) {
      sets.push("purchase_qty = ?");
      params.push(Number(data.purchase_qty));
    }
    if (data.cost_per_purchase !== undefined) {
      sets.push("cost_per_purchase = ?");
      params.push(Number(data.cost_per_purchase));
    }
    if (data.es_principal !== undefined) {
      sets.push("es_principal = ?");
      params.push(data.es_principal ? 1 : 0);
    }
    if ("notes" in data) {
      sets.push("notes = ?");
      params.push(trimOrNull(data.notes));
    }

    params.push(id, tenantId);
    await conn.execute(
      `UPDATE supplier_ingredients SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`,
      params,
    );

    // Propagate unit_cost if this is or becomes principal
    const becomingPrincipal = data.es_principal === true;
    const wasPrincipal = mapDbBool(existing.es_principal);
    const costChanged = data.purchase_qty !== undefined || data.cost_per_purchase !== undefined;

    if (becomingPrincipal || (wasPrincipal && costChanged)) {
      await conn.execute(
        `UPDATE ingredients SET unit_cost = ? WHERE id = ? AND tenant_id = ?`,
        [unitCostCalculated, String(existing.ingredient_id), tenantId],
      );
    }

    await conn.commit();

    const [[row]] = await conn.execute<RowDataPacket[]>(
      `SELECT ${SI_SELECT}
       FROM supplier_ingredients si
       JOIN ingredients i ON i.id = si.ingredient_id
       WHERE si.id = ? AND si.tenant_id = ?`,
      [id, tenantId],
    );

    return mapSupplierIngredientRow(row);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function removeSupplierIngredient(
  tenantId: string,
  id: string,
): Promise<void> {
  const [[row]] = await pool.execute<RowDataPacket[]>(
    `SELECT ingredient_id, es_principal FROM supplier_ingredients
     WHERE id = ? AND tenant_id = ?`,
    [id, tenantId],
  );
  if (!row) return;

  const wasPrincipal = mapDbBool(row.es_principal);
  const ingredientId = String(row.ingredient_id);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `DELETE FROM supplier_ingredients WHERE id = ? AND tenant_id = ?`,
      [id, tenantId],
    );

    if (wasPrincipal) {
      const [[next]] = await conn.execute<RowDataPacket[]>(
        `SELECT id, unit_cost_calculated FROM supplier_ingredients
         WHERE ingredient_id = ? AND tenant_id = ?
         ORDER BY created_at ASC
         LIMIT 1`,
        [ingredientId, tenantId],
      );
      if (next) {
        await conn.execute(
          `UPDATE supplier_ingredients SET es_principal = TRUE WHERE id = ?`,
          [String(next.id)],
        );
        await conn.execute(
          `UPDATE ingredients SET unit_cost = ? WHERE id = ? AND tenant_id = ?`,
          [Number(next.unit_cost_calculated) || 0, ingredientId, tenantId],
        );
      }
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// ─── Ingredient Search ────────────────────────────────────────────────────────

export async function searchIngredients(
  tenantId: string,
  q: string,
  excludeSupplierId?: string,
): Promise<IngredientSearchResult[]> {
  const params: (string | number)[] = [tenantId, `%${q}%`];

  let excludeClause = "";
  if (excludeSupplierId) {
    excludeClause = `AND i.id NOT IN (
      SELECT ingredient_id FROM supplier_ingredients
      WHERE supplier_id = ? AND tenant_id = i.tenant_id
    )`;
    params.push(excludeSupplierId);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT i.id, i.name AS nombre, i.unit, i.unit_cost, i.stock_quantity AS stock
     FROM ingredients i
     WHERE i.tenant_id = ? AND i.name LIKE ? AND i.is_active = 1
     ${excludeClause}
     ORDER BY i.name ASC
     LIMIT 30`,
    params,
  );

  return rows.map((r) => ({
    id: String(r.id),
    nombre: String(r.nombre),
    unit: String(r.unit),
    unit_cost: Number(r.unit_cost) || 0,
    stock: Number(r.stock) || 0,
  }));
}

// ─── Supplier Stats ───────────────────────────────────────────────────────────

export async function getSupplierStats(
  tenantId: string,
  supplierId: string,
): Promise<SupplierStats> {
  const [[statsRow]] = await pool.execute<RowDataPacket[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'received' THEN total ELSE 0 END), 0) AS total_comprado,
       COUNT(*) AS cantidad_ordenes,
       SUM(status = 'draft')     AS cnt_draft,
       SUM(status = 'sent')      AS cnt_sent,
       SUM(status = 'received')  AS cnt_received,
       SUM(status = 'cancelled') AS cnt_cancelled,
       MAX(created_at)           AS ultima_orden
     FROM purchase_orders
     WHERE tenant_id = ? AND supplier_id = ?`,
    [tenantId, supplierId],
  );

  return {
    total_comprado: Number(statsRow?.total_comprado) || 0,
    cantidad_ordenes: Number(statsRow?.cantidad_ordenes) || 0,
    ordenes_por_estado: {
      draft: Number(statsRow?.cnt_draft) || 0,
      sent: Number(statsRow?.cnt_sent) || 0,
      received: Number(statsRow?.cnt_received) || 0,
      cancelled: Number(statsRow?.cnt_cancelled) || 0,
    },
    ultima_orden: statsRow?.ultima_orden
      ? asIso(statsRow.ultima_orden)
      : null,
  };
}
