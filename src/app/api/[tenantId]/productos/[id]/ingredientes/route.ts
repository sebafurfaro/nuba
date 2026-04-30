import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { pool } from "@/lib/db";
import { addRecipeItem, ensureProductRecipe } from "@/lib/db/recipes";
import { unitTypeSchema } from "@/lib/recipes-api-schemas";
import type { RowDataPacket } from "mysql2/promise";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const bodySchema = z.object({
  ingredient_id: uuidSchema,
  cantidad: z.number().positive(),
  unidad: unitTypeSchema,
});

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id: productId } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { ingredient_id, cantidad, unidad } = parsed.data;

  try {
    const [prodRows] = await pool.query<RowDataPacket[]>(
      `SELECT name, recipe_id FROM products WHERE tenant_id = ? AND id = ? LIMIT 1`,
      [gate.tenantUuid, productId],
    );
    if (!prodRows[0]) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    const { name: productName, recipe_id: currentRecipeId } = prodRows[0] as {
      name: string;
      recipe_id: string | null;
    };

    // Verify the ingredient belongs to this tenant
    const [ingRows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM ingredients WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [ingredient_id, gate.tenantUuid],
    );
    if (!ingRows[0]) {
      return NextResponse.json({ error: "Ingrediente no encontrado" }, { status: 404 });
    }

    const recipeId = await ensureProductRecipe(
      gate.tenantUuid,
      productId,
      productName,
      currentRecipeId,
    );

    const item = await addRecipeItem(gate.tenantUuid, recipeId, {
      ingredient_id,
      quantity: cantidad,
      unit: unidad,
    });

    return NextResponse.json(
      { item, recipe_id: recipeId },
      { status: 201 },
    );
  } catch (e) {
    console.error("[POST productos/:id/ingredientes]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al agregar ingrediente" },
      { status: 500 },
    );
  }
}
