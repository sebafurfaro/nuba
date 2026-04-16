import { NextResponse } from "next/server";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { pool } from "@/lib/db";
import { calculateRecipeCost } from "@/lib/db/recipes";

type Ctx = { params: Promise<{ tenantId: string }> };

const unitEnum = z.enum(["ml", "l", "g", "kg", "u", "porciones"]);

const createVariantSchema = z.object({
  name: z.string().min(1).max(100),
  sku: z.string().max(100).nullable().optional(),
  price: z.number().nonnegative().nullable().optional(),
  stock: z.number().int().min(0),
});

const createProductSchema = z
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
    variants: z.array(createVariantSchema).optional(),
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

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }

  const [catRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name FROM categories
     WHERE tenant_id = ? AND is_active = TRUE
     ORDER BY name ASC`,
    [gate.tenantUuid],
  );

  const [prodRows] = await pool.query<RowDataPacket[]>(
    `SELECT p.id, p.name, p.sku, p.image_url, p.price, p.discount_price, p.stock,
            p.track_stock, p.is_active, p.recipe_id, p.category_id, p.portion_size,
            c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
     WHERE p.tenant_id = ?
     ORDER BY p.name ASC`,
    [gate.tenantUuid],
  );

  const categories = catRows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
  }));

  const products = [];
  for (const r of prodRows) {
    let food_cost_percentage: number | null = null;
    const recipeId = r.recipe_id as string | null;
    if (recipeId) {
      try {
        const costs = await calculateRecipeCost(gate.tenantUuid, recipeId);
        const portionSize = num(r.portion_size) || 1;
        const food_cost = costs.cost_per_portion * portionSize;
        const priceNum = num(
          r.discount_price != null ? r.discount_price : r.price,
        );
        food_cost_percentage =
          priceNum > 0 ? (food_cost / priceNum) * 100 : 0;
      } catch {
        food_cost_percentage = null;
      }
    }

    products.push({
      id: r.id as string,
      name: r.name as string,
      sku: (r.sku as string | null) ?? null,
      image_url: (r.image_url as string | null) ?? null,
      price: num(r.price),
      discount_price:
        r.discount_price == null ? null : num(r.discount_price),
      stock: num(r.stock),
      track_stock: Boolean(r.track_stock),
      is_active: Boolean(r.is_active),
      recipe_id: recipeId,
      category_id: (r.category_id as string | null) ?? null,
      category_name: (r.category_name as string | null) ?? null,
      food_cost_percentage,
    });
  }

  return NextResponse.json({ products, categories });
}

async function assertFk(
  conn: PoolConnection,
  tenantUuid: string,
  categoryId: string | null | undefined,
  recipeId: string | null | undefined,
): Promise<void> {
  if (categoryId) {
    const [c] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM categories WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [categoryId, tenantUuid],
    );
    if (!c.length) {
      throw new Error("Categoría inválida");
    }
  }
  if (recipeId) {
    const [r] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM recipes WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [recipeId, tenantUuid],
    );
    if (!r.length) {
      throw new Error("Receta inválida");
    }
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }

  const raw = await request.json().catch(() => null);
  const parsed = createProductSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;
  const skuNorm =
    b.sku && String(b.sku).trim() !== "" ? String(b.sku).trim() : null;
  const stockVal = b.track_stock ? (b.stock ?? 0) : 0;
  const portionSize = b.portion_size ?? 1;
  const imageNorm =
    b.image_url && String(b.image_url).trim() !== ""
      ? String(b.image_url).trim()
      : null;

  const conn = await pool.getConnection();
  const productId = crypto.randomUUID();
  try {
    await conn.beginTransaction();
    await assertFk(conn, gate.tenantUuid, b.category_id ?? null, b.recipe_id ?? null);

    await conn.query<ResultSetHeader>(
      `INSERT INTO products (
        id, tenant_id, branch_id, category_id, recipe_id, name, description, image_url,
        sku, price, discount_price, stock, track_stock, stock_alert_threshold,
        portion_size, portion_unit, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId,
        gate.tenantUuid,
        b.branch_id ?? null,
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
      ],
    );

    const variants = b.variants ?? [];
    for (const v of variants) {
      const vid = crypto.randomUUID();
      const vsku =
        v.sku && String(v.sku).trim() !== "" ? String(v.sku).trim() : null;
      await conn.query<ResultSetHeader>(
        `INSERT INTO product_variants (
          id, tenant_id, product_id, name, sku, price, stock, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [
          vid,
          gate.tenantUuid,
          productId,
          v.name,
          vsku,
          v.price ?? null,
          v.stock,
        ],
      );
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    const msg = e instanceof Error ? e.message : "";
    const code = (e as { code?: string })?.code;
    if (code === "ER_DUP_ENTRY") {
      return NextResponse.json(
        { error: "SKU duplicado para este comercio" },
        { status: 409 },
      );
    }
    if (msg.includes("inválid")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[POST productos]", e);
    return NextResponse.json({ error: "Error al crear producto" }, { status: 500 });
  } finally {
    conn.release();
  }

  return NextResponse.json({ id: productId }, { status: 201 });
}
