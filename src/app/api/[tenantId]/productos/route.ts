import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { categoryTreeToSelectOptions } from "@/lib/category-select-options";
import { getCategoryTree } from "@/lib/db/categories";
import { createProduct, getProducts } from "@/lib/db/products";
import type { UnitType } from "@/types/ingredient";

type Ctx = { params: Promise<{ tenantId: string }> };

const unitEnum = z.enum(["ml", "l", "g", "kg", "u", "porciones"]);

const createVariantSchema = z.object({
  name: z.string().min(1).max(100),
  sku: z.string().max(100).nullable().optional(),
  price: z.number().nonnegative().nullable().optional(),
  stock: z.number().int().min(0),
});

const inlineRecipeIngredientSchema = z.object({
  name: z.string().min(1).max(255),
  quantity: z.number().positive(),
  unit: unitEnum,
});

const createProductSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().max(10000).nullable().optional(),
    sku: z.string().max(100).nullable().optional(),
    category_id: z.preprocess(
      (v) => {
        if (v == null || v === "") {
          return null;
        }
        const s = typeof v === "string" ? v.trim() : v;
        return s === "" ? null : s;
      },
      z.union([z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i), z.null()]).optional(),
    ),
    price: z.number().positive(),
    discount_price: z.number().positive().nullable().optional(),
    track_stock: z.boolean(),
    stock: z.number().int().min(0).optional(),
    stock_alert_threshold: z.number().int().min(0).nullable().optional(),
    is_active: z.boolean(),
    recipe_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).nullable().optional(),
    /** Si viene con ítems, se crea receta + ingredientes nuevos y se ignora `recipe_id`. */
    inline_recipe_ingredients: z
      .array(inlineRecipeIngredientSchema)
      .max(40)
      .optional(),
    branch_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).nullable().optional(),
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

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }

  try {
    const products = await getProducts(gate.tenantUuid);
    const categoryTree = await getCategoryTree(gate.tenantUuid);
    const categories = categoryTreeToSelectOptions(categoryTree);
    return NextResponse.json({ products, categories });
  } catch (e) {
    console.error("[GET productos]", e);
    return NextResponse.json(
      { error: "Error al listar productos" },
      { status: 500 },
    );
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

  let productId: string;
  try {
    productId = await createProduct(gate.tenantUuid, {
      name: b.name,
      description: b.description ?? null,
      sku: b.sku ?? null,
      category_id: b.category_id ?? null,
      price: b.price,
      discount_price: b.discount_price ?? null,
      track_stock: b.track_stock,
      stock: b.stock,
      stock_alert_threshold: b.stock_alert_threshold ?? null,
      is_active: b.is_active,
      recipe_id: b.recipe_id ?? null,
      inline_recipe_ingredients: b.inline_recipe_ingredients?.map((row) => ({
        name: row.name,
        quantity: row.quantity,
        unit: row.unit as UnitType,
      })),
      branch_id: b.branch_id ?? null,
      image_url: b.image_url ?? null,
      portion_size: b.portion_size,
      portion_unit: b.portion_unit ?? null,
      variants: b.variants,
    });
  } catch (e) {
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
  }

  return NextResponse.json({ id: productId }, { status: 201 });
}
