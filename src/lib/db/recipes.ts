import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import { pool } from "@/lib/db";
import type { Ingredient, UnitType } from "@/types/ingredient";
import type { Recipe, RecipeItem, RecipeWithItems } from "@/types/recipe";

type DbExecutor = Pick<typeof pool, "query">;

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

function unitFamily(u: UnitType): "volume" | "mass" | "count" {
  if (u === "ml" || u === "l") {
    return "volume";
  }
  if (u === "g" || u === "kg") {
    return "mass";
  }
  return "count";
}

/** Cantidad en unidad base (ml o g) o unidades contables. */
function toBase(quantity: number, unit: UnitType): number {
  switch (unit) {
    case "ml":
      return quantity;
    case "l":
      return quantity * 1000;
    case "g":
      return quantity;
    case "kg":
      return quantity * 1000;
    case "u":
    case "porciones":
      return quantity;
  }
}

function fromBase(base: number, unit: UnitType): number {
  switch (unit) {
    case "ml":
      return base;
    case "l":
      return base / 1000;
    case "g":
      return base;
    case "kg":
      return base / 1000;
    case "u":
    case "porciones":
      return base;
  }
}

/** Convierte `quantity` expresada en `from` a la unidad `to` (misma familia). */
export function convertUnits(
  quantity: number,
  from: UnitType,
  to: UnitType,
): number {
  if (from === to) {
    return quantity;
  }
  if (unitFamily(from) !== unitFamily(to)) {
    throw new Error(`Unidades incompatibles: ${from} → ${to}`);
  }
  return fromBase(toBase(quantity, from), to);
}

function mapIngredient(row: RowDataPacket): Ingredient {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    branch_id: row.branch_id ?? null,
    name: row.name,
    unit: row.unit as UnitType,
    unit_cost: num(row.unit_cost),
    stock_quantity: num(row.stock_quantity),
    stock_alert_threshold:
      row.stock_alert_threshold == null ? null : num(row.stock_alert_threshold),
    supplier_id: row.supplier_id ?? null,
    is_active: Boolean(row.is_active),
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
  };
}

function mapRecipe(row: RowDataPacket): Recipe {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    description: row.description ?? null,
    yield_quantity: num(row.yield_quantity),
    yield_unit: row.yield_unit as UnitType,
    is_sub_recipe: Boolean(row.is_sub_recipe),
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
  };
}

export type CreateIngredientData = Pick<
  Ingredient,
  "name" | "unit" | "unit_cost" | "stock_quantity" | "is_active"
> &
  Partial<
    Pick<
      Ingredient,
      "branch_id" | "stock_alert_threshold" | "supplier_id"
    >
  >;

export type UpdateIngredientData = Partial<
  Omit<
    Ingredient,
    "id" | "tenant_id" | "created_at" | "updated_at"
  >
>;

export type CreateRecipeData = Pick<
  Recipe,
  "name" | "yield_quantity" | "yield_unit"
> &
  Partial<Pick<Recipe, "description" | "is_sub_recipe">>;

export type UpdateRecipeData = Partial<
  Omit<Recipe, "id" | "tenant_id" | "created_at" | "updated_at">
>;

export type AddRecipeItemInput =
  | {
      ingredient_id: string;
      sub_recipe_id?: undefined;
      quantity: number;
      unit: UnitType;
      notes?: string | null;
    }
  | {
      ingredient_id?: undefined;
      sub_recipe_id: string;
      quantity: number;
      unit: UnitType;
      notes?: string | null;
    };

export async function getIngredients(
  tenantId: string,
  branchId?: string,
  options?: { activeOnly?: boolean },
): Promise<Ingredient[]> {
  let sql = `SELECT * FROM ingredients WHERE tenant_id = ?`;
  const params: unknown[] = [tenantId];
  if (branchId !== undefined) {
    sql += ` AND (branch_id = ? OR branch_id IS NULL)`;
    params.push(branchId);
  }
  if (options?.activeOnly !== false) {
    sql += ` AND is_active = TRUE`;
  }
  sql += ` ORDER BY name ASC`;
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows.map(mapIngredient);
}

async function getIngredientByIdExec(
  exec: DbExecutor,
  tenantId: string,
  id: string,
): Promise<Ingredient | null> {
  const [rows] = await exec.query<RowDataPacket[]>(
    `SELECT * FROM ingredients WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, id],
  );
  return rows[0] ? mapIngredient(rows[0]) : null;
}

export async function getIngredientById(
  tenantId: string,
  id: string,
): Promise<Ingredient | null> {
  return getIngredientByIdExec(pool, tenantId, id);
}

const INGREDIENT_UPDATE_COLUMNS = new Set([
  "branch_id",
  "name",
  "unit",
  "unit_cost",
  "stock_quantity",
  "stock_alert_threshold",
  "supplier_id",
  "is_active",
]);

const RECIPE_UPDATE_COLUMNS = new Set([
  "name",
  "description",
  "yield_quantity",
  "yield_unit",
  "is_sub_recipe",
]);

export async function createIngredient(
  tenantId: string,
  data: CreateIngredientData,
): Promise<Ingredient> {
  const id = crypto.randomUUID();
  await pool.query<ResultSetHeader>(
    `INSERT INTO ingredients (
      id, tenant_id, branch_id, name, unit, unit_cost, stock_quantity,
      stock_alert_threshold, supplier_id, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      tenantId,
      data.branch_id ?? null,
      data.name,
      data.unit,
      data.unit_cost,
      data.stock_quantity,
      data.stock_alert_threshold ?? null,
      data.supplier_id ?? null,
      data.is_active,
    ],
  );
  const created = await getIngredientById(tenantId, id);
  if (!created) {
    throw new Error("No se pudo leer el ingrediente creado");
  }
  return created;
}

export async function updateIngredient(
  tenantId: string,
  id: string,
  data: UpdateIngredientData,
): Promise<Ingredient> {
  const entries = Object.entries(data).filter(
    ([k, v]) => v !== undefined && INGREDIENT_UPDATE_COLUMNS.has(k),
  ) as [string, unknown][];
  if (!entries.length) {
    const cur = await getIngredientById(tenantId, id);
    if (!cur) {
      throw new Error("Ingrediente no encontrado");
    }
    return cur;
  }
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  const values = entries.map(([, v]) => v);
  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE ingredients SET ${sets} WHERE tenant_id = ? AND id = ?`,
    [...values, tenantId, id],
  );
  if (res.affectedRows === 0) {
    throw new Error("Ingrediente no encontrado");
  }
  const updated = await getIngredientById(tenantId, id);
  if (!updated) {
    throw new Error("Ingrediente no encontrado");
  }
  return updated;
}

async function updateIngredientStockExec(
  exec: DbExecutor,
  tenantId: string,
  id: string,
  delta: number,
): Promise<void> {
  const [res] = await exec.query<ResultSetHeader>(
    `UPDATE ingredients SET stock_quantity = stock_quantity + ? WHERE tenant_id = ? AND id = ?`,
    [delta, tenantId, id],
  );
  if (res.affectedRows === 0) {
    throw new Error("Ingrediente no encontrado");
  }
}

export async function updateIngredientStock(
  tenantId: string,
  id: string,
  delta: number,
): Promise<void> {
  await updateIngredientStockExec(pool, tenantId, id, delta);
}

export async function getRecipes(
  tenantId: string,
  filters?: { isSubRecipe?: boolean },
): Promise<Recipe[]> {
  let sql = `SELECT * FROM recipes WHERE tenant_id = ?`;
  const params: unknown[] = [tenantId];
  if (filters?.isSubRecipe !== undefined) {
    sql += ` AND is_sub_recipe = ?`;
    params.push(filters.isSubRecipe);
  }
  sql += ` ORDER BY name ASC`;
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows.map(mapRecipe);
}

async function fetchRecipeRow(
  exec: DbExecutor,
  tenantId: string,
  id: string,
): Promise<RowDataPacket | null> {
  const [rows] = await exec.query<RowDataPacket[]>(
    `SELECT * FROM recipes WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, id],
  );
  return rows[0] ?? null;
}

export async function getRecipeById(
  tenantId: string,
  id: string,
): Promise<RecipeWithItems | null> {
  const row = await fetchRecipeRow(pool, tenantId, id);
  if (!row) {
    return null;
  }
  const recipe = mapRecipe(row);
  const [itemRows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM recipe_items WHERE tenant_id = ? AND recipe_id = ? ORDER BY id ASC`,
    [tenantId, id],
  );
  const items: RecipeItem[] = [];
  for (const ir of itemRows) {
    if (ir.ingredient_id) {
      const ing = await getIngredientById(tenantId, ir.ingredient_id);
      if (!ing) {
        throw new Error(`Ingrediente faltante en receta: ${ir.ingredient_id}`);
      }
      items.push({
        id: ir.id,
        tenant_id: ir.tenant_id,
        recipe_id: ir.recipe_id,
        quantity: num(ir.quantity),
        unit: ir.unit as UnitType,
        notes: ir.notes ?? null,
        created_at: asIso(ir.created_at),
        updated_at: asIso(ir.updated_at),
        ingredient_id: ir.ingredient_id,
        sub_recipe_id: null,
        ingredient: ing,
      });
    } else if (ir.sub_recipe_id) {
      const nested = await getRecipeById(tenantId, ir.sub_recipe_id);
      if (!nested) {
        throw new Error(`Sub-receta faltante: ${ir.sub_recipe_id}`);
      }
      items.push({
        id: ir.id,
        tenant_id: ir.tenant_id,
        recipe_id: ir.recipe_id,
        quantity: num(ir.quantity),
        unit: ir.unit as UnitType,
        notes: ir.notes ?? null,
        created_at: asIso(ir.created_at),
        updated_at: asIso(ir.updated_at),
        ingredient_id: null,
        sub_recipe_id: ir.sub_recipe_id,
        sub_recipe: nested,
      });
    } else {
      throw new Error("recipe_items inválido: sin ingrediente ni sub-receta");
    }
  }
  const costs = await calculateRecipeCost(tenantId, id);
  return {
    ...recipe,
    items,
    cost_total: costs.cost_total,
    cost_per_portion: costs.cost_per_portion,
  };
}

export async function createRecipe(
  tenantId: string,
  data: CreateRecipeData,
): Promise<Recipe> {
  const id = crypto.randomUUID();
  await pool.query<ResultSetHeader>(
    `INSERT INTO recipes (
      id, tenant_id, name, description, yield_quantity, yield_unit, is_sub_recipe
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      tenantId,
      data.name,
      data.description ?? null,
      data.yield_quantity,
      data.yield_unit,
      data.is_sub_recipe ?? false,
    ],
  );
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM recipes WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, id],
  );
  if (!rows[0]) {
    throw new Error("No se pudo leer la receta creada");
  }
  return mapRecipe(rows[0]);
}

/** Crea receta e ítems en una sola transacción. */
export async function createRecipeWithItems(
  tenantId: string,
  recipe: CreateRecipeData,
  items: AddRecipeItemInput[],
): Promise<RecipeWithItems> {
  const conn = await pool.getConnection();
  const recipeId = crypto.randomUUID();
  try {
    await conn.beginTransaction();
    await conn.query<ResultSetHeader>(
      `INSERT INTO recipes (
        id, tenant_id, name, description, yield_quantity, yield_unit, is_sub_recipe
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        recipeId,
        tenantId,
        recipe.name,
        recipe.description ?? null,
        recipe.yield_quantity,
        recipe.yield_unit,
        recipe.is_sub_recipe ?? false,
      ],
    );
    for (const item of items) {
      const hasIng = "ingredient_id" in item && item.ingredient_id;
      const hasSub = "sub_recipe_id" in item && item.sub_recipe_id;
      if (hasIng === hasSub) {
        throw new Error("Debe indicarse ingredient_id o sub_recipe_id, no ambos");
      }
      const ingredientId = hasIng ? item.ingredient_id : null;
      const subRecipeId = hasSub ? item.sub_recipe_id : null;
      if (subRecipeId === recipeId) {
        throw new Error("sub_recipe_id no puede ser igual a recipe_id");
      }
      const itemRowId = crypto.randomUUID();
      await conn.query<ResultSetHeader>(
        `INSERT INTO recipe_items (
          id, tenant_id, recipe_id, ingredient_id, sub_recipe_id, quantity, unit, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          itemRowId,
          tenantId,
          recipeId,
          ingredientId,
          subRecipeId,
          item.quantity,
          item.unit,
          item.notes ?? null,
        ],
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  const full = await getRecipeById(tenantId, recipeId);
  if (!full) {
    throw new Error("No se pudo leer la receta creada");
  }
  return full;
}

export async function updateRecipe(
  tenantId: string,
  id: string,
  data: UpdateRecipeData,
): Promise<Recipe> {
  const entries = Object.entries(data).filter(
    ([k, v]) => v !== undefined && RECIPE_UPDATE_COLUMNS.has(k),
  ) as [string, unknown][];
  if (!entries.length) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM recipes WHERE tenant_id = ? AND id = ? LIMIT 1`,
      [tenantId, id],
    );
    if (!rows[0]) {
      throw new Error("Receta no encontrada");
    }
    return mapRecipe(rows[0]);
  }
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  const values = entries.map(([, v]) => v);
  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE recipes SET ${sets} WHERE tenant_id = ? AND id = ?`,
    [...values, tenantId, id],
  );
  if (res.affectedRows === 0) {
    throw new Error("Receta no encontrada");
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM recipes WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, id],
  );
  if (!rows[0]) {
    throw new Error("Receta no encontrada");
  }
  return mapRecipe(rows[0]);
}

export async function addRecipeItem(
  tenantId: string,
  recipeId: string,
  item: AddRecipeItemInput,
): Promise<RecipeItem> {
  const hasIng = "ingredient_id" in item && item.ingredient_id;
  const hasSub = "sub_recipe_id" in item && item.sub_recipe_id;
  if (hasIng === hasSub) {
    throw new Error("Debe indicarse ingredient_id o sub_recipe_id, no ambos");
  }
  const id = crypto.randomUUID();
  const ingredientId = hasIng ? item.ingredient_id : null;
  const subRecipeId = hasSub ? item.sub_recipe_id : null;
  if (subRecipeId === recipeId) {
    throw new Error("sub_recipe_id no puede ser igual a recipe_id");
  }
  await pool.query<ResultSetHeader>(
    `INSERT INTO recipe_items (
      id, tenant_id, recipe_id, ingredient_id, sub_recipe_id, quantity, unit, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      tenantId,
      recipeId,
      ingredientId,
      subRecipeId,
      item.quantity,
      item.unit,
      item.notes ?? null,
    ],
  );
  const full = await getRecipeById(tenantId, recipeId);
  if (!full) {
    throw new Error("Receta no encontrada");
  }
  const added = full.items.find((i) => i.id === id);
  if (!added) {
    throw new Error("No se pudo leer el ítem de receta creado");
  }
  return added;
}

export async function removeRecipeItem(
  tenantId: string,
  recipeId: string,
  itemId: string,
): Promise<void> {
  const [res] = await pool.query<ResultSetHeader>(
    `DELETE FROM recipe_items WHERE tenant_id = ? AND recipe_id = ? AND id = ?`,
    [tenantId, recipeId, itemId],
  );
  if (res.affectedRows === 0) {
    throw new Error("Ítem de receta no encontrado");
  }
}

export async function calculateRecipeCost(
  tenantId: string,
  recipeId: string,
): Promise<{ cost_total: number; cost_per_portion: number }> {
  const row = await fetchRecipeRow(pool, tenantId, recipeId);
  if (!row) {
    throw new Error("Receta no encontrada");
  }
  const yieldQty = num(row.yield_quantity);
  if (yieldQty <= 0) {
    return { cost_total: 0, cost_per_portion: 0 };
  }
  const [itemRows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM recipe_items WHERE tenant_id = ? AND recipe_id = ?`,
    [tenantId, recipeId],
  );
  let costTotal = 0;
  for (const ir of itemRows) {
    if (ir.ingredient_id) {
      const ing = await getIngredientById(tenantId, ir.ingredient_id);
      if (!ing) {
        throw new Error(`Ingrediente no encontrado: ${ir.ingredient_id}`);
      }
      const qtyInIngUnit = convertUnits(
        num(ir.quantity),
        ir.unit as UnitType,
        ing.unit,
      );
      costTotal += qtyInIngUnit * ing.unit_cost;
    } else if (ir.sub_recipe_id) {
      const subRow = await fetchRecipeRow(pool, tenantId, ir.sub_recipe_id);
      if (!subRow) {
        throw new Error(`Sub-receta no encontrada: ${ir.sub_recipe_id}`);
      }
      const subCost = await calculateRecipeCost(tenantId, ir.sub_recipe_id);
      const subYieldQty = num(subRow.yield_quantity);
      const subYieldUnit = subRow.yield_unit as UnitType;
      if (subYieldQty <= 0) {
        continue;
      }
      const consumedInSubYieldUnit = convertUnits(
        num(ir.quantity),
        ir.unit as UnitType,
        subYieldUnit,
      );
      const fraction = consumedInSubYieldUnit / subYieldQty;
      costTotal += subCost.cost_total * fraction;
    }
  }
  return {
    cost_total: costTotal,
    cost_per_portion: costTotal / yieldQty,
  };
}

/** Líneas de costo para tablas de receta (ingredientes y sub-recetas). */
export type RecipeCostLineBreakdown = {
  kind: "ingredient" | "sub_recipe";
  name: string;
  quantity: number;
  unit: UnitType;
  /** Costo unitario del insumo en su unidad de stock; null en sub-recetas. */
  unit_cost: number | null;
  line_total: number;
};

export async function getRecipeCostBreakdown(
  tenantId: string,
  recipeId: string,
): Promise<{
  recipe_id: string;
  recipe_name: string;
  yield_quantity: number;
  yield_unit: UnitType;
  cost_total: number;
  cost_per_portion: number;
  lines: RecipeCostLineBreakdown[];
}> {
  const full = await getRecipeById(tenantId, recipeId);
  if (!full) {
    throw new Error("Receta no encontrada");
  }
  const costs = await calculateRecipeCost(tenantId, recipeId);
  const lines: RecipeCostLineBreakdown[] = [];
  for (const item of full.items) {
    if (item.ingredient_id && item.ingredient) {
      const ing = item.ingredient;
      const qtyInIngUnit = convertUnits(item.quantity, item.unit, ing.unit);
      const line_total = qtyInIngUnit * ing.unit_cost;
      lines.push({
        kind: "ingredient",
        name: ing.name,
        quantity: item.quantity,
        unit: item.unit,
        unit_cost: ing.unit_cost,
        line_total,
      });
    } else if (item.sub_recipe_id && item.sub_recipe) {
      const subRow = await fetchRecipeRow(pool, tenantId, item.sub_recipe_id);
      if (!subRow) {
        continue;
      }
      const subCost = await calculateRecipeCost(tenantId, item.sub_recipe_id);
      const subYieldQty = num(subRow.yield_quantity);
      const subYieldUnit = subRow.yield_unit as UnitType;
      if (subYieldQty <= 0) {
        continue;
      }
      const consumedInSubYieldUnit = convertUnits(
        item.quantity,
        item.unit,
        subYieldUnit,
      );
      const fraction = consumedInSubYieldUnit / subYieldQty;
      const line_total = subCost.cost_total * fraction;
      lines.push({
        kind: "sub_recipe",
        name: item.sub_recipe.name,
        quantity: item.quantity,
        unit: item.unit,
        unit_cost: null,
        line_total,
      });
    }
  }
  return {
    recipe_id: full.id,
    recipe_name: full.name,
    yield_quantity: full.yield_quantity,
    yield_unit: full.yield_unit,
    cost_total: costs.cost_total,
    cost_per_portion: costs.cost_per_portion,
    lines,
  };
}

async function accumulateStockDeltas(
  exec: DbExecutor,
  tenantId: string,
  recipeId: string,
  batchScale: number,
  deltas: Map<string, number>,
): Promise<void> {
  const row = await fetchRecipeRow(exec, tenantId, recipeId);
  if (!row) {
    throw new Error(`Receta no encontrada: ${recipeId}`);
  }
  const yieldQty = num(row.yield_quantity);
  if (yieldQty <= 0) {
    return;
  }
  const scale = batchScale / yieldQty;
  const [itemRows] = await exec.query<RowDataPacket[]>(
    `SELECT * FROM recipe_items WHERE tenant_id = ? AND recipe_id = ?`,
    [tenantId, recipeId],
  );
  for (const ir of itemRows) {
    const lineQty = num(ir.quantity) * scale;
    if (ir.ingredient_id) {
      const ing = await getIngredientByIdExec(exec, tenantId, ir.ingredient_id);
      if (!ing) {
        throw new Error(`Ingrediente no encontrado: ${ir.ingredient_id}`);
      }
      const qtyInIngUnit = convertUnits(
        lineQty,
        ir.unit as UnitType,
        ing.unit,
      );
      const prev = deltas.get(ing.id) ?? 0;
      deltas.set(ing.id, prev - qtyInIngUnit);
    } else if (ir.sub_recipe_id) {
      const subRow = await fetchRecipeRow(exec, tenantId, ir.sub_recipe_id);
      if (!subRow) {
        throw new Error(`Sub-receta no encontrada: ${ir.sub_recipe_id}`);
      }
      const subYieldQty = num(subRow.yield_quantity);
      const subYieldUnit = subRow.yield_unit as UnitType;
      if (subYieldQty <= 0) {
        continue;
      }
      const consumedInSubYieldUnit = convertUnits(
        num(ir.quantity) * scale,
        ir.unit as UnitType,
        subYieldUnit,
      );
      const subBatchScale = consumedInSubYieldUnit;
      await accumulateStockDeltas(
        exec,
        tenantId,
        ir.sub_recipe_id,
        subBatchScale,
        deltas,
      );
    }
  }
}

/**
 * Descuenta stock según ítems del pedido (misma conexión; sin BEGIN/COMMIT).
 * @returns IDs de ingredientes cuyo `stock_quantity` se actualizó (claves de deltas).
 */
export async function deductStockFromOrderWithConnection(
  conn: PoolConnection,
  tenantId: string,
  orderId: string,
): Promise<ReadonlySet<string>> {
  const [lines] = await conn.query<RowDataPacket[]>(
    `SELECT oi.id, oi.product_id, oi.quantity,
            p.recipe_id, p.portion_size, p.portion_unit
     FROM order_items oi
     INNER JOIN orders o ON o.id = oi.order_id AND o.tenant_id = oi.tenant_id
     INNER JOIN products p ON p.id = oi.product_id AND p.tenant_id = oi.tenant_id
     WHERE oi.tenant_id = ? AND o.tenant_id = ? AND oi.order_id = ?
       AND oi.product_id IS NOT NULL AND p.recipe_id IS NOT NULL`,
    [tenantId, tenantId, orderId],
  );
  const deltas = new Map<string, number>();
  for (const line of lines) {
    const recipeId = line.recipe_id as string;
    const qtySold = num(line.quantity);
    const portionSize = num(line.portion_size);
    const portionUnit = line.portion_unit as UnitType | null;
    const recipeRow = await fetchRecipeRow(conn, tenantId, recipeId);
    if (!recipeRow) {
      throw new Error(`Receta no encontrada en producto: ${recipeId}`);
    }
    const yieldQty = num(recipeRow.yield_quantity);
    const yieldUnit = recipeRow.yield_unit as UnitType;
    if (yieldQty <= 0) {
      continue;
    }
    let soldInYieldUnit = qtySold * portionSize;
    if (portionUnit != null && portionUnit !== yieldUnit) {
      soldInYieldUnit = convertUnits(
        qtySold * portionSize,
        portionUnit,
        yieldUnit,
      );
    }
    const batchScale = soldInYieldUnit;
    await accumulateStockDeltas(conn, tenantId, recipeId, batchScale, deltas);
  }
  for (const [ingredientId, delta] of deltas) {
    await updateIngredientStockExec(conn, tenantId, ingredientId, delta);
  }
  return new Set(deltas.keys());
}

export async function deductStockFromOrder(
  tenantId: string,
  orderId: string,
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await deductStockFromOrderWithConnection(conn, tenantId, orderId);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
