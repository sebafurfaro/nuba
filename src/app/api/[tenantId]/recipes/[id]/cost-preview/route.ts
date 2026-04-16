import { NextResponse } from "next/server";

import { getTenantSession } from "@/lib/api-tenant-session";
import { calculateRecipeCost } from "@/lib/db/recipes";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

function num(v: string | null): number | null {
  if (v == null || v === "") {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Costo por unidad vendida (portion_size=1) y food cost % vs precio efectivo. */
export async function GET(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id: recipeId } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }

  const { searchParams } = new URL(request.url);
  const price = num(searchParams.get("price"));
  const discountPrice = num(searchParams.get("discount_price"));

  if (price == null) {
    return NextResponse.json(
      { error: "Query price requerido (número positivo)" },
      { status: 400 },
    );
  }

  try {
    const costs = await calculateRecipeCost(gate.tenantUuid, recipeId);
    const portionSize = 1;
    const food_cost = costs.cost_per_portion * portionSize;
    const effective = discountPrice != null ? discountPrice : price;
    const food_cost_percentage =
      effective > 0 ? (food_cost / effective) * 100 : 0;
    return NextResponse.json({
      food_cost,
      food_cost_percentage,
      cost_total: costs.cost_total,
      cost_per_portion: costs.cost_per_portion,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo calcular la receta" },
      { status: 400 },
    );
  }
}
