import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { pool } from "@/lib/db";
import { getRecipeCostBreakdown } from "@/lib/db/recipes";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const unitEnum = z.enum(["ml", "l", "g", "kg", "u", "porciones"]);

const updateProductFullSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().max(10000).nullable().optional(),
    sku: z.string().max(100).nullable().optional(),
    category_id: z.string().uuid().nullable().optional(),
    price: z.number().positive(),
    discount_price: z.number().positive().nullable().optional(),
    track_stock: z.boolean(),
    stock: z.number().int().min(0).optional(),
    stock_alert_threshold: z.number().int().min(0).nullable().optional(),
    is_active: z.boolean(),
    recipe_id: z.string().uuid().nullable().optional(),
    branch_id: z.string().uuid().nullable().optional(),
    image_url: z.string().max(2000).nullable().optional(),
    portion_size: z.number().positive().optional(),
    portion_unit: unitEnum.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const d = data.discount_price;
    if (d != null && d !== undefined && d >= data.price) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discount_price"],
        message: "Debe ser menor al precio",
      });
    }
    if (data.track_stock && data.stock === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stock"],
        message: "Indicá el stock",
      });
    }
  });

const updateProductActiveOnlySchema = z.object({
  is_active: z.boolean(),
});

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function assertFk(
  tenantUuid: string,
  categoryId: string | null | undefined,
  recipeId: string | null | undefined,
): Promise<void> {
  if (categoryId) {
    const [c] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM categories WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [categoryId, tenantUuid],
    );
    if (!c.length) {
      throw new Error("Categoría inválida");
    }
  }
  if (recipeId) {
    const [r] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM recipes WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [recipeId, tenantUuid],
    );
    if (!r.length) {
      throw new Error("Receta inválida");
    }
  }
}

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }

  const [prodRows] = await pool.query<RowDataPacket[]>(
    `SELECT p.id, p.name, p.description, p.sku, p.image_url, p.price, p.discount_price,
            p.stock, p.track_stock, p.stock_alert_threshold, p.is_active, p.recipe_id,
            p.category_id, p.portion_size, p.portion_unit, p.branch_id,
            c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
     WHERE p.id = ? AND p.tenant_id = ?
     LIMIT 1`,
    [id, gate.tenantUuid],
  );
  if (!prodRows.length) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const r = prodRows[0]!;

  const [varRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name, sku, price, stock, is_active
     FROM product_variants
     WHERE product_id = ? AND tenant_id = ?
     ORDER BY name ASC`,
    [id, gate.tenantUuid],
  );

  const [catRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name FROM categories
     WHERE tenant_id = ? AND is_active = TRUE
     ORDER BY name ASC`,
    [gate.tenantUuid],
  );

  const recipeId = (r.recipe_id as string | null) ?? null;
  let recipe_breakdown: Awaited<ReturnType<typeof getRecipeCostBreakdown>> | null =
    null;
  if (recipeId) {
    try {
      recipe_breakdown = await getRecipeCostBreakdown(gate.tenantUuid, recipeId);
    } catch {
      recipe_breakdown = null;
    }
  }

  const product = {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    sku: (r.sku as string | null) ?? null,
    image_url: (r.image_url as string | null) ?? null,
    price: num(r.price),
    discount_price:
      r.discount_price == null ? null : num(r.discount_price),
    stock: num(r.stock),
    track_stock: Boolean(r.track_stock),
    stock_alert_threshold:
      r.stock_alert_threshold == null ? null : num(r.stock_alert_threshold),
    is_active: Boolean(r.is_active),
    recipe_id: recipeId,
    category_id: (r.category_id as string | null) ?? null,
    category_name: (r.category_name as string | null) ?? null,
    portion_size: num(r.portion_size) || 1,
    portion_unit: (r.portion_unit as string | null) ?? null,
    branch_id: (r.branch_id as string | null) ?? null,
  };

  const variants = varRows.map((v) => ({
    id: v.id as string,
    name: v.name as string,
    sku: (v.sku as string | null) ?? null,
    price: v.price == null ? null : num(v.price),
    stock: num(v.stock),
    is_active: Boolean(v.is_active),
  }));

  const categories = catRows.map((c) => ({
    id: c.id as string,
    name: c.name as string,
  }));

  return NextResponse.json({
    product,
    variants,
    categories,
    recipe_breakdown,
  });
}

export async function PUT(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }

  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const keys = Object.keys(raw as object);

  if (keys.length === 1 && keys[0] === "is_active") {
    const parsed = updateProductActiveOnlySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    const [res] = await pool.query<ResultSetHeader>(
      `UPDATE products SET is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`,
      [parsed.data.is_active, id, gate.tenantUuid],
    );
    if (res.affectedRows === 0) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, is_active: parsed.data.is_active });
  }

  const parsed = updateProductFullSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;

  const [existingRows] = await pool.query<RowDataPacket[]>(
    `SELECT sku FROM products WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [id, gate.tenantUuid],
  );
  if (!existingRows.length) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
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
    skuNorm =
      b.sku && String(b.sku).trim() !== "" ? String(b.sku).trim() : null;
  }

  const stockVal = b.track_stock ? (b.stock ?? 0) : 0;
  const portionSize = b.portion_size ?? 1;
  const imageNorm =
    b.image_url && String(b.image_url).trim() !== ""
      ? String(b.image_url).trim()
      : null;

  try {
    await assertFk(
      gate.tenantUuid,
      b.category_id ?? null,
      b.recipe_id ?? null,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return NextResponse.json({ error: msg || "FK inválida" }, { status: 400 });
  }

  try {
    const [res] = await pool.query<ResultSetHeader>(
      `UPDATE products SET
        category_id = ?, recipe_id = ?, name = ?, description = ?, image_url = ?,
        sku = ?, price = ?, discount_price = ?, stock = ?, track_stock = ?,
        stock_alert_threshold = ?, portion_size = ?, portion_unit = ?,
        is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`,
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
        id,
        gate.tenantUuid,
      ],
    );
    if (res.affectedRows === 0) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "ER_DUP_ENTRY") {
      return NextResponse.json(
        { error: "SKU duplicado para este comercio" },
        { status: 409 },
      );
    }
    console.error("[PUT productos id]", e);
    return NextResponse.json(
      { error: "Error al actualizar producto" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }
  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE products SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND tenant_id = ?`,
    [id, gate.tenantUuid],
  );
  if (res.affectedRows === 0) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
