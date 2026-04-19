import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { categoryTreeToSelectOptions } from "@/lib/category-select-options";
import { getCategoryTree } from "@/lib/db/categories";
import {
  deleteProduct,
  getProductById,
  updateProduct,
} from "@/lib/db/products";
import type { UnitType } from "@/types/ingredient";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const unitEnum = z.enum(["ml", "l", "g", "kg", "u", "porciones"]);

function emptyStringToNullU(v: unknown): unknown {
  if (v == null || v === "") {
    return null;
  }
  if (typeof v === "string" && v.trim() === "") {
    return null;
  }
  return typeof v === "string" ? v.trim() : v;
}

const updateProductFullSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().max(10000).nullable().optional(),
    sku: z.string().max(100).nullable().optional(),
    category_id: z.preprocess(
      emptyStringToNullU,
      z.union([z.string().uuid(), z.null()]).optional(),
    ),
    price: z.number().positive(),
    discount_price: z.number().positive().nullable().optional(),
    track_stock: z.boolean(),
    stock: z.number().int().min(0).optional(),
    stock_alert_threshold: z.number().int().min(0).nullable().optional(),
    is_active: z.boolean(),
    recipe_id: z.preprocess(
      emptyStringToNullU,
      z.union([z.string().uuid(), z.null()]).optional(),
    ),
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

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }

  try {
    const detail = await getProductById(gate.tenantUuid, id);
    if (!detail) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    let categories: { id: string; name: string }[] = [];
    try {
      const categoryTree = await getCategoryTree(gate.tenantUuid);
      categories = categoryTreeToSelectOptions(categoryTree);
    } catch (e) {
      console.error("[GET productos/[id]] categories", e);
    }

    return NextResponse.json({
      product: detail.product,
      variants: detail.variants,
      categories,
      recipe_breakdown: detail.recipe_breakdown,
    });
  } catch (e) {
    console.error("[GET productos/[id]]", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Error al cargar el producto",
      },
      { status: 500 },
    );
  }
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
    const { affectedRows } = await updateProduct(gate.tenantUuid, id, {
      kind: "active_only",
      is_active: parsed.data.is_active,
    });
    if (affectedRows === 0) {
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

  try {
    const { affectedRows } = await updateProduct(gate.tenantUuid, id, {
      kind: "full",
      data: {
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
        branch_id: b.branch_id ?? null,
        image_url: b.image_url ?? null,
        portion_size: b.portion_size,
        portion_unit: (b.portion_unit ?? null) as UnitType | null,
      },
    });
    if (affectedRows === 0) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("inválid")) {
      return NextResponse.json({ error: msg || "FK inválida" }, { status: 400 });
    }
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
  const { affectedRows } = await deleteProduct(gate.tenantUuid, id);
  if (affectedRows === 0) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
