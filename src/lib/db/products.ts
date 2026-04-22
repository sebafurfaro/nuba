import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { pool } from "@/lib/db";
import {
  calculateRecipeCost,
  createInlineRecipeForProductOnConn,
  getRecipeCostBreakdown,
} from "@/lib/db/recipes";
import type { UnitType } from "@/types/ingredient";
import type { CSVProductRow, ImportResult, ImportRowError } from "@/types/product";

function num(v: unknown): number {
  const n = Number(v);
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

function jsonSafePayload<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? String(value) : value,
    ),
  ) as T;
}

export type ProductListItem = {
  id: string;
  name: string;
  sku: string | null;
  image_url: string | null;
  price: number;
  discount_price: number | null;
  stock: number;
  track_stock: boolean;
  is_active: boolean;
  recipe_id: string | null;
  category_id: string | null;
  category_name: string | null;
  food_cost_percentage: number | null;
};

export type ProductListFilters = {
  categoryId?: string | null;
  activeOnly?: boolean;
  /** Si se pasa, filtra por productos disponibles en esa sucursal (globales + asignados). */
  branchId?: string | null;
};

export async function getProducts(
  tenantUuid: string,
  filters?: ProductListFilters,
): Promise<ProductListItem[]> {
  const branchId = filters?.branchId ?? null;

  let prodRows: RowDataPacket[];

  if (branchId) {
    // Modelo C: productos globales O asignados a esta sucursal, activos en la sucursal
    const categoryClause = filters?.categoryId
      ? "AND p.category_id = ?"
      : "";
    const categoryParams: unknown[] = filters?.categoryId ? [filters.categoryId] : [];

    [prodRows] = await pool.query<RowDataPacket[]>(
      `SELECT p.id, p.name, p.sku, p.image_url,
              COALESCE(bp.price_override, p.price) AS price,
              p.discount_price, p.stock,
              p.track_stock, p.is_active, p.recipe_id, p.category_id, p.portion_size,
              c.name AS category_name
       FROM products p
       LEFT JOIN branch_products bp
         ON bp.product_id = p.id AND bp.branch_id = ?
       LEFT JOIN categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
       WHERE p.tenant_id = ?
         AND p.is_active = TRUE
         AND (p.is_global = TRUE OR bp.branch_id IS NOT NULL)
         AND COALESCE(bp.is_active, TRUE) = TRUE
         ${categoryClause}
       ORDER BY p.name ASC`,
      [branchId, tenantUuid, ...categoryParams],
    );
  } else {
    // Listado admin: comportamiento original sin filtro de sucursal
    const where: string[] = ["p.tenant_id = ?"];
    const params: unknown[] = [tenantUuid];
    if (filters?.categoryId) {
      where.push("p.category_id = ?");
      params.push(filters.categoryId);
    }
    if (filters?.activeOnly === true) {
      where.push("p.is_active = TRUE");
    }

    [prodRows] = await pool.query<RowDataPacket[]>(
      `SELECT p.id, p.name, p.sku, p.image_url, p.price, p.discount_price, p.stock,
              p.track_stock, p.is_active, p.recipe_id, p.category_id, p.portion_size,
              c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
       WHERE ${where.join(" AND ")}
       ORDER BY p.name ASC`,
      params,
    );
  }

  // food_cost_percentage se calcula solo en el detalle (getProductById) para
  // evitar un N+1 de calculateRecipeCost en listados grandes.
  return prodRows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    sku: (r.sku as string | null) ?? null,
    image_url: (r.image_url as string | null) ?? null,
    price: num(r.price),
    discount_price: r.discount_price == null ? null : num(r.discount_price),
    stock: num(r.stock),
    track_stock: mapDbBool(r.track_stock),
    is_active: mapDbBool(r.is_active),
    recipe_id: (r.recipe_id as string | null) ?? null,
    category_id: (r.category_id as string | null) ?? null,
    category_name: (r.category_name as string | null) ?? null,
    food_cost_percentage: null,
  }));
}

export type ProductVariantRow = {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  stock: number;
  is_active: boolean;
};

export type ProductDetail = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  image_url: string | null;
  price: number;
  discount_price: number | null;
  stock: number;
  track_stock: boolean;
  stock_alert_threshold: number | null;
  is_active: boolean;
  recipe_id: string | null;
  category_id: string | null;
  category_name: string | null;
  portion_size: number;
  portion_unit: string | null;
  branch_id: string | null;
};

export type GetProductByIdResult = {
  product: ProductDetail;
  variants: ProductVariantRow[];
  recipe_breakdown: Awaited<ReturnType<typeof getRecipeCostBreakdown>> | null;
};

export async function getProductById(
  tenantUuid: string,
  productId: string,
): Promise<GetProductByIdResult | null> {
  const [prodRows] = await pool.query<RowDataPacket[]>(
    `SELECT p.id, p.name, p.description, p.sku, p.image_url, p.price, p.discount_price,
            p.stock, p.track_stock, p.stock_alert_threshold, p.is_active, p.recipe_id,
            p.category_id, p.portion_size, p.portion_unit, p.branch_id,
            c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
     WHERE p.tenant_id = ? AND p.id = ?
     LIMIT 1`,
    [tenantUuid, productId],
  );
  if (!prodRows.length) {
    return null;
  }

  const r = prodRows[0]!;

  const [varRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name, sku, price, stock, is_active
     FROM product_variants
     WHERE tenant_id = ? AND product_id = ?
     ORDER BY name ASC`,
    [tenantUuid, productId],
  );

  const recipeId = (r.recipe_id as string | null) ?? null;
  let recipe_breakdown: Awaited<ReturnType<typeof getRecipeCostBreakdown>> | null =
    null;
  if (recipeId) {
    try {
      recipe_breakdown = await getRecipeCostBreakdown(tenantUuid, recipeId);
    } catch (e) {
      console.error("[getProductById] recipe_breakdown", e);
      recipe_breakdown = null;
    }
  }

  const product: ProductDetail = {
    id: String(r.id),
    name: String(r.name),
    description: (r.description as string | null) ?? null,
    sku: (r.sku as string | null) ?? null,
    image_url: (r.image_url as string | null) ?? null,
    price: num(r.price),
    discount_price: r.discount_price == null ? null : num(r.discount_price),
    stock: num(r.stock),
    track_stock: mapDbBool(r.track_stock),
    stock_alert_threshold:
      r.stock_alert_threshold == null ? null : num(r.stock_alert_threshold),
    is_active: mapDbBool(r.is_active),
    recipe_id: recipeId,
    category_id: (r.category_id as string | null) ?? null,
    category_name: (r.category_name as string | null) ?? null,
    portion_size: num(r.portion_size) || 1,
    portion_unit: (r.portion_unit as string | null) ?? null,
    branch_id: (r.branch_id as string | null) ?? null,
  };

  const variants: ProductVariantRow[] = varRows.map((v) => ({
    id: String(v.id),
    name: String(v.name),
    sku: (v.sku as string | null) ?? null,
    price: v.price == null ? null : num(v.price),
    stock: num(v.stock),
    is_active: mapDbBool(v.is_active),
  }));

  return jsonSafePayload({
    product,
    variants,
    recipe_breakdown,
  });
}

export type InlineRecipeIngredientInput = {
  name: string;
  quantity: number;
  unit: UnitType;
};

export type CreateProductVariantInput = {
  name: string;
  sku?: string | null;
  price?: number | null;
  stock: number;
};

export type CreateProductInput = {
  name: string;
  description?: string | null;
  sku?: string | null;
  category_id?: string | null;
  price: number;
  discount_price?: number | null;
  track_stock: boolean;
  stock?: number;
  stock_alert_threshold?: number | null;
  is_active: boolean;
  recipe_id?: string | null;
  inline_recipe_ingredients?: InlineRecipeIngredientInput[];
  branch_id?: string | null;
  image_url?: string | null;
  portion_size?: number;
  portion_unit?: UnitType | null;
  variants?: CreateProductVariantInput[];
};

async function assertFkOnConn(
  conn: PoolConnection,
  tenantUuid: string,
  categoryId: string | null | undefined,
  recipeId: string | null | undefined,
): Promise<void> {
  if (categoryId) {
    const [c] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM categories WHERE tenant_id = ? AND id = ? LIMIT 1`,
      [tenantUuid, categoryId],
    );
    if (!c.length) {
      throw new Error("Categoría inválida");
    }
  }
  if (recipeId) {
    const [r] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM recipes WHERE tenant_id = ? AND id = ? LIMIT 1`,
      [tenantUuid, recipeId],
    );
    if (!r.length) {
      throw new Error("Receta inválida");
    }
  }
}

async function assertFk(
  tenantUuid: string,
  categoryId: string | null | undefined,
  recipeId: string | null | undefined,
): Promise<void> {
  if (categoryId) {
    const [c] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM categories WHERE tenant_id = ? AND id = ? LIMIT 1`,
      [tenantUuid, categoryId],
    );
    if (!c.length) {
      throw new Error("Categoría inválida");
    }
  }
  if (recipeId) {
    const [r] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM recipes WHERE tenant_id = ? AND id = ? LIMIT 1`,
      [tenantUuid, recipeId],
    );
    if (!r.length) {
      throw new Error("Receta inválida");
    }
  }
}

export async function createProduct(
  tenantUuid: string,
  data: CreateProductInput,
): Promise<string> {
  const skuNorm =
    data.sku && String(data.sku).trim() !== "" ? String(data.sku).trim() : null;
  const stockVal = data.track_stock ? (data.stock ?? 0) : 0;
  const portionSize = data.portion_size ?? 1;
  const imageNorm =
    data.image_url && String(data.image_url).trim() !== ""
      ? String(data.image_url).trim()
      : null;

  const conn = await pool.getConnection();
  const productId = crypto.randomUUID();
  try {
    await conn.beginTransaction();

    let recipeIdForProduct: string | null = data.recipe_id ?? null;
    const inline = data.inline_recipe_ingredients;
    if (inline && inline.length > 0) {
      recipeIdForProduct = await createInlineRecipeForProductOnConn(
        conn,
        tenantUuid,
        data.name,
        inline.map((row) => ({
          name: row.name.trim(),
          quantity: row.quantity,
          unit: row.unit,
        })),
      );
    }

    await assertFkOnConn(conn, tenantUuid, data.category_id ?? null, recipeIdForProduct);

    await conn.query<ResultSetHeader>(
      `INSERT INTO products (
        id, tenant_id, branch_id, category_id, recipe_id, name, description, image_url,
        sku, price, discount_price, stock, track_stock, stock_alert_threshold,
        portion_size, portion_unit, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId,
        tenantUuid,
        data.branch_id ?? null,
        data.category_id ?? null,
        recipeIdForProduct,
        data.name,
        data.description ?? null,
        imageNorm,
        skuNorm,
        data.price,
        data.discount_price ?? null,
        stockVal,
        data.track_stock,
        data.stock_alert_threshold ?? null,
        portionSize,
        data.portion_unit ?? null,
        data.is_active,
      ],
    );

    const variants = data.variants ?? [];
    for (const v of variants) {
      const vid = crypto.randomUUID();
      const vsku =
        v.sku && String(v.sku).trim() !== "" ? String(v.sku).trim() : null;
      await conn.query<ResultSetHeader>(
        `INSERT INTO product_variants (
          id, tenant_id, product_id, name, sku, price, stock, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [vid, tenantUuid, productId, v.name, vsku, v.price ?? null, v.stock],
      );
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  return productId;
}

export type UpdateProductFullInput = {
  name: string;
  description?: string | null;
  sku?: string | null;
  category_id?: string | null;
  price: number;
  discount_price?: number | null;
  track_stock: boolean;
  stock?: number;
  stock_alert_threshold?: number | null;
  is_active: boolean;
  recipe_id?: string | null;
  branch_id?: string | null;
  image_url?: string | null;
  portion_size?: number;
  portion_unit?: UnitType | null;
};

export type UpdateProductInput =
  | { kind: "active_only"; is_active: boolean }
  | { kind: "full"; data: UpdateProductFullInput };

export async function updateProduct(
  tenantUuid: string,
  productId: string,
  input: UpdateProductInput,
): Promise<{ affectedRows: number }> {
  if (input.kind === "active_only") {
    const [res] = await pool.query<ResultSetHeader>(
      `UPDATE products SET is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND id = ?`,
      [input.is_active, tenantUuid, productId],
    );
    return { affectedRows: res.affectedRows };
  }

  const b = input.data;

  const [existingRows] = await pool.query<RowDataPacket[]>(
    `SELECT sku FROM products WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantUuid, productId],
  );
  if (!existingRows.length) {
    return { affectedRows: 0 };
  }
  const existingSkuRaw = existingRows[0]!.sku as string | null;
  const existingSku =
    existingSkuRaw && String(existingSkuRaw).trim() !== ""
      ? String(existingSkuRaw).trim()
      : null;

  let skuNorm: string | null;
  if (existingSku != null) {
    skuNorm = existingSku;
  } else {
    skuNorm = b.sku && String(b.sku).trim() !== "" ? String(b.sku).trim() : null;
  }

  const stockVal = b.track_stock ? (b.stock ?? 0) : 0;
  const portionSize = b.portion_size ?? 1;
  const imageNorm =
    b.image_url && String(b.image_url).trim() !== ""
      ? String(b.image_url).trim()
      : null;

  await assertFk(tenantUuid, b.category_id ?? null, b.recipe_id ?? null);

  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE products SET
      category_id = ?, recipe_id = ?, name = ?, description = ?, image_url = ?,
      sku = ?, price = ?, discount_price = ?, stock = ?, track_stock = ?,
      stock_alert_threshold = ?, portion_size = ?, portion_unit = ?,
      is_active = ?, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND id = ?`,
    [
      b.category_id ?? null,
      b.recipe_id ?? null,
      b.name,
      b.description ?? null,
      imageNorm,
      skuNorm,
      b.price,
      b.discount_price ?? null,
      stockVal,
      b.track_stock,
      b.stock_alert_threshold ?? null,
      portionSize,
      b.portion_unit ?? null,
      b.is_active,
      tenantUuid,
      productId,
    ],
  );
  return { affectedRows: res.affectedRows };
}

export async function deleteProduct(
  tenantUuid: string,
  productId: string,
): Promise<{ affectedRows: number }> {
  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE products SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND id = ?`,
    [tenantUuid, productId],
  );
  return { affectedRows: res.affectedRows };
}

export type ProductVariantWriteInput = {
  name: string;
  sku?: string | null;
  price?: number | null;
  stock: number;
};

export async function createProductVariant(
  tenantUuid: string,
  productId: string,
  data: ProductVariantWriteInput,
): Promise<string> {
  const conn = await pool.getConnection();
  const variantId = crypto.randomUUID();
  const vsku =
    data.sku && String(data.sku).trim() !== "" ? String(data.sku).trim() : null;
  try {
    await conn.beginTransaction();
    const [p] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM products WHERE tenant_id = ? AND id = ? LIMIT 1`,
      [tenantUuid, productId],
    );
    if (!p.length) {
      throw new Error("PRODUCT_NOT_FOUND");
    }
    await conn.query<ResultSetHeader>(
      `INSERT INTO product_variants (
        id, tenant_id, product_id, name, sku, price, stock, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [variantId, tenantUuid, productId, data.name, vsku, data.price ?? null, data.stock],
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return variantId;
}

export async function updateProductVariant(
  tenantUuid: string,
  productId: string,
  variantId: string,
  data: ProductVariantWriteInput,
): Promise<{ affectedRows: number }> {
  const vsku =
    data.sku && String(data.sku).trim() !== "" ? String(data.sku).trim() : null;
  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE product_variants SET
      name = ?, sku = ?, price = ?, stock = ?
     WHERE tenant_id = ? AND product_id = ? AND id = ?`,
    [
      data.name,
      vsku,
      data.price ?? null,
      data.stock,
      tenantUuid,
      productId,
      variantId,
    ],
  );
  return { affectedRows: res.affectedRows };
}

export async function deleteProductVariant(
  tenantUuid: string,
  productId: string,
  variantId: string,
): Promise<{ affectedRows: number }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [check] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM product_variants WHERE tenant_id = ? AND product_id = ? AND id = ? LIMIT 1`,
      [tenantUuid, productId, variantId],
    );
    if (!check.length) {
      await conn.rollback();
      return { affectedRows: 0 };
    }
    const [res] = await conn.query<ResultSetHeader>(
      `DELETE FROM product_variants WHERE tenant_id = ? AND product_id = ? AND id = ?`,
      [tenantUuid, productId, variantId],
    );
    await conn.commit();
    return { affectedRows: res.affectedRows };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export type ProductFoodCostResult = {
  food_cost: number;
  food_cost_percentage: number;
};

export async function getProductFoodCost(
  tenantUuid: string,
  productId: string,
): Promise<ProductFoodCostResult | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT recipe_id, portion_size, price, discount_price
     FROM products
     WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantUuid, productId],
  );
  const row = rows[0] as
    | {
        recipe_id: string | null;
        portion_size: unknown;
        price: unknown;
        discount_price: unknown;
      }
    | undefined;
  if (!row) {
    return null;
  }
  if (!row.recipe_id) {
    return { food_cost: 0, food_cost_percentage: 0 };
  }
  const costs = await calculateRecipeCost(tenantUuid, row.recipe_id);
  const portionSize = Number(row.portion_size);
  const ps = Number.isFinite(portionSize) ? portionSize : 1;
  const food_cost = costs.cost_per_portion * ps;
  const priceNum = Number(row.discount_price != null ? row.discount_price : row.price);
  const effectivePrice = Number.isFinite(priceNum) ? priceNum : 0;
  const food_cost_percentage =
    effectivePrice > 0 ? (food_cost / effectivePrice) * 100 : 0;
  return { food_cost, food_cost_percentage };
}

// ─── Branch-product functions (Modelo C) ─────────────────────────────────────

import type { BranchProduct } from "@/types/product";

export async function getProductBranchAssignments(
  tenantUuid: string,
  productId: string,
): Promise<BranchProduct[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT bp.id, bp.branch_id, b.name AS branch_name, bp.product_id,
            bp.is_active, bp.price_override,
            COALESCE(bp.price_override, p.price) AS effective_price
     FROM branch_products bp
     JOIN branches b  ON b.id  = bp.branch_id
     JOIN products p  ON p.id  = bp.product_id
     WHERE bp.tenant_id = ? AND bp.product_id = ?
     ORDER BY b.name ASC`,
    [tenantUuid, productId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    branch_id: String(r.branch_id),
    branch_name: String(r.branch_name),
    product_id: String(r.product_id),
    is_active: mapDbBool(r.is_active),
    price_override: r.price_override == null ? null : num(r.price_override),
    effective_price: num(r.effective_price),
  }));
}

async function fetchBranchProduct(
  tenantUuid: string,
  productId: string,
  branchId: string,
): Promise<BranchProduct | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT bp.id, bp.branch_id, b.name AS branch_name, bp.product_id,
            bp.is_active, bp.price_override,
            COALESCE(bp.price_override, p.price) AS effective_price
     FROM branch_products bp
     JOIN branches b ON b.id = bp.branch_id
     JOIN products p ON p.id = bp.product_id
     WHERE bp.tenant_id = ? AND bp.product_id = ? AND bp.branch_id = ?
     LIMIT 1`,
    [tenantUuid, productId, branchId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: String(r.id),
    branch_id: String(r.branch_id),
    branch_name: String(r.branch_name),
    product_id: String(r.product_id),
    is_active: mapDbBool(r.is_active),
    price_override: r.price_override == null ? null : num(r.price_override),
    effective_price: num(r.effective_price),
  };
}

export async function assignProductToBranch(
  tenantUuid: string,
  productId: string,
  branchId: string,
  priceOverride?: number | null,
): Promise<BranchProduct> {
  await pool.query<ResultSetHeader>(
    `INSERT INTO branch_products (tenant_id, branch_id, product_id, is_active, price_override)
     VALUES (?, ?, ?, TRUE, ?)
     ON DUPLICATE KEY UPDATE
       is_active = TRUE,
       price_override = VALUES(price_override)`,
    [tenantUuid, branchId, productId, priceOverride ?? null],
  );
  const result = await fetchBranchProduct(tenantUuid, productId, branchId);
  if (!result) throw new Error("branch_product no encontrado tras upsert");
  return result;
}

export async function unassignProductFromBranch(
  tenantUuid: string,
  productId: string,
  branchId: string,
): Promise<void> {
  await pool.query<ResultSetHeader>(
    `UPDATE branch_products SET is_active = FALSE
     WHERE tenant_id = ? AND product_id = ? AND branch_id = ?`,
    [tenantUuid, productId, branchId],
  );
}

export async function updateBranchProductPrice(
  tenantUuid: string,
  productId: string,
  branchId: string,
  priceOverride: number | null,
): Promise<BranchProduct> {
  await pool.query<ResultSetHeader>(
    `UPDATE branch_products SET price_override = ?
     WHERE tenant_id = ? AND product_id = ? AND branch_id = ?`,
    [priceOverride, tenantUuid, productId, branchId],
  );
  const result = await fetchBranchProduct(tenantUuid, productId, branchId);
  if (!result) throw new Error("branch_product no encontrado");
  return result;
}

export async function makeProductGlobal(
  tenantUuid: string,
  productId: string,
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query<ResultSetHeader>(
      `UPDATE products SET is_global = TRUE WHERE tenant_id = ? AND id = ?`,
      [tenantUuid, productId],
    );
    // Asignar a todas las sucursales activas que aún no lo tengan
    await conn.query<ResultSetHeader>(
      `INSERT IGNORE INTO branch_products (tenant_id, branch_id, product_id, is_active)
       SELECT ?, b.id, ?, TRUE
       FROM branches b
       WHERE b.tenant_id = ? AND b.is_active = TRUE`,
      [tenantUuid, productId, tenantUuid],
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function makeProductBranchSpecific(
  tenantUuid: string,
  productId: string,
): Promise<void> {
  await pool.query<ResultSetHeader>(
    `UPDATE products SET is_global = FALSE WHERE tenant_id = ? AND id = ?`,
    [tenantUuid, productId],
  );
}

// ─── CSV Import ───────────────────────────────────────────────────────────────

export type { CSVProductRow, ImportResult, ImportRowError };

export async function importProductsFromCSV(
  tenantId: string,
  rows: CSVProductRow[],
): Promise<ImportResult> {
  const result: ImportResult = {
    total: rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  // Cargar categorías activas del tenant en memoria para evitar una query por fila
  const [catRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, name FROM categories WHERE tenant_id = ? AND is_active = TRUE`,
    [tenantId],
  );
  const categoryCache = new Map<string, string>(
    (catRows as { id: string; name: string }[]).map((c) => [
      c.name.toLowerCase().trim(),
      c.id,
    ]),
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 2; // +2 porque fila 1 es el header

    try {
      // ── Validaciones ──────────────────────────────────────────────────────

      if (!row.nombre?.trim()) {
        result.errors.push({
          row: rowNum,
          sku: row.sku ?? "",
          nombre: "",
          error: "El nombre es requerido",
        });
        result.skipped++;
        continue;
      }

      const precio = parseFloat(row.precio ?? "");
      if (isNaN(precio) || precio <= 0) {
        result.errors.push({
          row: rowNum,
          sku: row.sku ?? "",
          nombre: row.nombre,
          error: `Precio inválido: "${row.precio}"`,
        });
        result.skipped++;
        continue;
      }

      const precioDescuento = row.precio_descuento?.trim()
        ? parseFloat(row.precio_descuento)
        : null;
      if (precioDescuento !== null) {
        if (isNaN(precioDescuento) || precioDescuento <= 0) {
          result.errors.push({
            row: rowNum,
            sku: row.sku ?? "",
            nombre: row.nombre,
            error: `Precio descuento inválido: "${row.precio_descuento}"`,
          });
          result.skipped++;
          continue;
        }
        if (precioDescuento >= precio) {
          result.errors.push({
            row: rowNum,
            sku: row.sku ?? "",
            nombre: row.nombre,
            error: "El precio descuento debe ser menor al precio base",
          });
          result.skipped++;
          continue;
        }
      }

      const stock = row.stock?.trim() ? parseInt(row.stock, 10) : 0;
      if (isNaN(stock) || stock < 0) {
        result.errors.push({
          row: rowNum,
          sku: row.sku ?? "",
          nombre: row.nombre,
          error: `Stock inválido: "${row.stock}"`,
        });
        result.skipped++;
        continue;
      }

      const isActive =
        !row.activo?.trim() ||
        ["true", "1", "si", "sí", "yes"].includes(
          row.activo.toLowerCase().trim(),
        );

      // ── Categoría ─────────────────────────────────────────────────────────

      let categoryId: string | null = null;
      if (row.categoria?.trim()) {
        const catKey = row.categoria.toLowerCase().trim();
        if (categoryCache.has(catKey)) {
          categoryId = categoryCache.get(catKey)!;
        } else {
          const newCatId = crypto.randomUUID();
          await pool.execute<ResultSetHeader>(
            `INSERT INTO categories (id, tenant_id, name, level, sort_order, is_active)
             VALUES (?, ?, ?, 0, 0, TRUE)`,
            [newCatId, tenantId, row.categoria.trim()],
          );
          categoryCache.set(catKey, newCatId);
          categoryId = newCatId;
        }
      }

      // ── SKU ───────────────────────────────────────────────────────────────

      const sku =
        row.sku?.trim() ||
        `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      // ── Upsert ────────────────────────────────────────────────────────────

      const [existing] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM products WHERE tenant_id = ? AND sku = ? LIMIT 1`,
        [tenantId, sku],
      );

      if ((existing as RowDataPacket[]).length > 0) {
        const existingId = (existing as { id: string }[])[0]!.id;
        await pool.execute<ResultSetHeader>(
          `UPDATE products SET
             name = ?, description = ?, category_id = ?,
             price = ?, discount_price = ?, stock = ?,
             is_active = ?, updated_at = NOW()
           WHERE id = ? AND tenant_id = ?`,
          [
            row.nombre.trim(),
            row.descripcion?.trim() || null,
            categoryId,
            precio,
            precioDescuento,
            stock,
            isActive ? 1 : 0,
            existingId,
            tenantId,
          ],
        );
        result.updated++;
      } else {
        const newId = crypto.randomUUID();
        await pool.execute<ResultSetHeader>(
          `INSERT INTO products
             (id, tenant_id, sku, name, description,
              category_id, price, discount_price,
              stock, track_stock, is_active, is_global)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, TRUE)`,
          [
            newId,
            tenantId,
            sku,
            row.nombre.trim(),
            row.descripcion?.trim() || null,
            categoryId,
            precio,
            precioDescuento,
            stock,
            isActive ? 1 : 0,
          ],
        );
        result.created++;
      }
    } catch (err) {
      console.error(`[CSV Import] Error en fila ${rowNum}:`, err);
      result.errors.push({
        row: rowNum,
        sku: row.sku ?? "",
        nombre: row.nombre ?? "",
        error: "Error interno al procesar esta fila",
      });
      result.skipped++;
    }
  }

  return result;
}
