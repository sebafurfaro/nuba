import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { pool } from "@/lib/db";
import type { Category, CategoryTree, CategoryWithChildren } from "@/types/category";

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

function mapLevel(value: unknown): 0 | 1 {
  return num(value) >= 1 ? 1 : 0;
}

function mapCategory(row: RowDataPacket): Category {
  const c: Category = {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    parent_id: (row.parent_id as string | null) ?? null,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
    level: mapLevel(row.level),
    sort_order: num(row.sort_order),
    is_active: Boolean(row.is_active),
    created_at: asIso(row.created_at),
  };
  return c;
}

function withOptionalProductCount(
  row: RowDataPacket,
): { category: Category; product_count?: number } {
  const pc =
    row.product_count != null && row.product_count !== undefined
      ? num(row.product_count)
      : undefined;
  const category = mapCategory(row);
  return {
    category,
    ...(pc !== undefined ? { product_count: pc } : {}),
  };
}

async function countProductsForCategory(
  tenantId: string,
  categoryId: string,
): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM products
     WHERE tenant_id = ? AND category_id = ?`,
    [tenantId, categoryId],
  );
  return num(rows[0]?.cnt);
}

async function countChildCategories(
  tenantId: string,
  parentId: string,
): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM categories
     WHERE tenant_id = ? AND parent_id = ?`,
    [tenantId, parentId],
  );
  return num(rows[0]?.cnt);
}

async function fetchParentRow(
  tenantId: string,
  parentId: string,
): Promise<RowDataPacket | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM categories WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [parentId, tenantId],
  );
  return rows[0] ?? null;
}

function assertParentAllowsChild(parentRow: RowDataPacket): void {
  const parentLevel = mapLevel(parentRow.level);
  if (parentLevel !== 0) {
    throw new Error("No se puede anidar más de 2 niveles");
  }
}

export type CreateCategoryInput = {
  name: string;
  description?: string | null;
  image_url?: string | null;
  parent_id?: string | null;
  sort_order?: number;
};

export type UpdateCategoryInput = Partial<{
  name: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
}>;

/** Trae todas las categorías del tenant y las organiza como árbol (solo raíces con `children`). */
export async function getCategoryTree(tenantId: string): Promise<CategoryTree> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.*,
            (SELECT COUNT(*) FROM products p
             WHERE p.tenant_id = c.tenant_id AND p.category_id = c.id) AS product_count
     FROM categories c
     WHERE c.tenant_id = ?
     ORDER BY c.sort_order ASC, c.name ASC`,
    [tenantId],
  );

  const roots: CategoryWithChildren[] = [];
  const childrenByParent = new Map<string, Category[]>();

  for (const r of rows) {
    const pid = (r.parent_id as string | null) ?? null;
    const { category, product_count } = withOptionalProductCount(r);
    const node: Category = { ...category };
    if (pid == null || pid === "") {
      const rootCat: Category = {
        ...node,
        ...(product_count !== undefined ? { product_count } : {}),
      };
      roots.push({
        ...rootCat,
        children: [],
      });
    } else {
      const list = childrenByParent.get(pid) ?? [];
      const childNode: Category = {
        ...node,
        ...(product_count !== undefined ? { product_count } : {}),
      };
      list.push(childNode);
      childrenByParent.set(pid, list);
    }
  }

  for (const root of roots) {
    root.children = (childrenByParent.get(root.id) ?? []).sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
    );
  }

  roots.sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );
  return roots;
}

export async function getCategoryById(
  tenantId: string,
  id: string,
): Promise<CategoryWithChildren | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.*,
            (SELECT COUNT(*) FROM products p
             WHERE p.tenant_id = c.tenant_id AND p.category_id = c.id) AS product_count
     FROM categories c
     WHERE c.id = ? AND c.tenant_id = ?
     LIMIT 1`,
    [id, tenantId],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  const { category, product_count } = withOptionalProductCount(row);

  const [childRows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM categories
     WHERE tenant_id = ? AND parent_id = ?
     ORDER BY sort_order ASC, name ASC`,
    [tenantId, id],
  );
  const children = childRows.map((cr) => mapCategory(cr));

  return {
    ...category,
    product_count,
    children,
  };
}

export async function createCategory(
  tenantId: string,
  data: CreateCategoryInput,
): Promise<Category> {
  if (!data.name || String(data.name).trim() === "") {
    throw new Error("El nombre es obligatorio");
  }
  const parentId =
    data.parent_id && String(data.parent_id).trim() !== ""
      ? String(data.parent_id).trim()
      : null;

  let level: 0 | 1 = 0;
  if (parentId) {
    const parent = await fetchParentRow(tenantId, parentId);
    if (!parent) {
      throw new Error("Categoría padre no encontrada");
    }
    assertParentAllowsChild(parent);
    level = 1;
  }

  const id = crypto.randomUUID();
  const sortOrder =
    data.sort_order != null && Number.isFinite(data.sort_order)
      ? Math.trunc(data.sort_order)
      : 0;

  await pool.query<ResultSetHeader>(
    `INSERT INTO categories (
      id, tenant_id, parent_id, name, description, image_url, sort_order, level, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [
      id,
      tenantId,
      parentId,
      data.name.trim(),
      data.description ?? null,
      data.image_url ?? null,
      sortOrder,
      level,
    ],
  );

  const [out] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM categories WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [id, tenantId],
  );
  if (!out[0]) {
    throw new Error("No se pudo leer la categoría creada");
  }
  return mapCategory(out[0]);
}

export async function updateCategory(
  tenantId: string,
  id: string,
  data: UpdateCategoryInput,
): Promise<Category> {
  const [curRows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM categories WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [id, tenantId],
  );
  const current = curRows[0];
  if (!current) {
    throw new Error("Categoría no encontrada");
  }

  const childCount = await countChildCategories(tenantId, id);
  const hasChildren = childCount > 0;

  const nextParentId =
    data.parent_id !== undefined
      ? data.parent_id && String(data.parent_id).trim() !== ""
        ? String(data.parent_id).trim()
        : null
      : ((current.parent_id as string | null) ?? null);

  if (data.parent_id !== undefined) {
    if (hasChildren && nextParentId != null) {
      throw new Error(
        "No se puede convertir en subcategoría una categoría que tiene subcategorías",
      );
    }
    if (nextParentId === id) {
      throw new Error("La categoría no puede ser padre de sí misma");
    }
  }

  let nextLevel: 0 | 1 = mapLevel(current.level);
  if (data.parent_id !== undefined) {
    if (nextParentId == null) {
      nextLevel = 0;
    } else {
      const parent = await fetchParentRow(tenantId, nextParentId);
      if (!parent) {
        throw new Error("Categoría padre no encontrada");
      }
      assertParentAllowsChild(parent);
      nextLevel = 1;
    }
  }

  const name =
    data.name !== undefined ? String(data.name).trim() : (current.name as string);
  const description =
    data.description !== undefined
      ? data.description
      : ((current.description as string | null) ?? null);
  const imageUrl =
    data.image_url !== undefined
      ? data.image_url
      : ((current.image_url as string | null) ?? null);
  const sortOrder =
    data.sort_order !== undefined
      ? Math.trunc(num(data.sort_order))
      : num(current.sort_order);
  const isActive =
    data.is_active !== undefined
      ? Boolean(data.is_active)
      : Boolean(current.is_active);

  await pool.query<ResultSetHeader>(
    `UPDATE categories SET
      parent_id = ?, name = ?, description = ?, image_url = ?,
      sort_order = ?, level = ?, is_active = ?
     WHERE id = ? AND tenant_id = ?`,
    [
      nextParentId,
      name,
      description,
      imageUrl,
      sortOrder,
      nextLevel,
      isActive,
      id,
      tenantId,
    ],
  );

  const [out] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM categories WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [id, tenantId],
  );
  if (!out[0]) {
    throw new Error("Categoría no encontrada tras actualizar");
  }
  return mapCategory(out[0]);
}

export async function deleteCategory(tenantId: string, id: string): Promise<void> {
  const children = await countChildCategories(tenantId, id);
  if (children > 0) {
    throw new Error("Eliminá las subcategorías primero");
  }
  const products = await countProductsForCategory(tenantId, id);
  if (products > 0) {
    throw new Error("Reasigná los productos antes de eliminar");
  }
  const [res] = await pool.query<ResultSetHeader>(
    `DELETE FROM categories WHERE id = ? AND tenant_id = ?`,
    [id, tenantId],
  );
  if (res.affectedRows === 0) {
    throw new Error("Categoría no encontrada");
  }
}

export async function updateSortOrder(
  tenantId: string,
  items: { id: string; sort_order: number }[],
): Promise<void> {
  await Promise.all(
    items.map((it) =>
      pool.query<ResultSetHeader>(
        `UPDATE categories SET sort_order = ?
         WHERE id = ? AND tenant_id = ?`,
        [Math.trunc(num(it.sort_order)), it.id, tenantId],
      ),
    ),
  );
}
