import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { getTenantSession } from "@/lib/api-tenant-session";
import { pool } from "@/lib/db";
import { calculateRecipeCost } from "@/lib/db/recipes";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId, id: productId } = await ctx.params;
  const gate = await getTenantSession(tenantId);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT recipe_id, portion_size, price, discount_price
     FROM products
     WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [gate.tenantUuid, productId],
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
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }
  if (!row.recipe_id) {
    return NextResponse.json({
      food_cost: 0,
      food_cost_percentage: 0,
    });
  }
  try {
    const costs = await calculateRecipeCost(gate.tenantUuid, row.recipe_id);
    const portionSize = Number(row.portion_size);
    const ps = Number.isFinite(portionSize) ? portionSize : 1;
    const food_cost = costs.cost_per_portion * ps;
    const priceNum = Number(
      row.discount_price != null ? row.discount_price : row.price,
    );
    const effectivePrice = Number.isFinite(priceNum) ? priceNum : 0;
    const food_cost_percentage =
      effectivePrice > 0 ? (food_cost / effectivePrice) * 100 : 0;
    return NextResponse.json({
      food_cost,
      food_cost_percentage,
    });
  } catch (e) {
    console.error("[GET food-cost]", e);
    return NextResponse.json(
      { error: "No se pudo calcular el costo" },
      { status: 500 },
    );
  }
}
