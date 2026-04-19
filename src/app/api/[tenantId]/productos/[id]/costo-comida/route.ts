import { NextResponse } from "next/server";

import { getTenantSession } from "@/lib/api-tenant-session";
import { getProductFoodCost } from "@/lib/db/products";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId, id: productId } = await ctx.params;
  const gate = await getTenantSession(tenantId);
  if (gate instanceof NextResponse) {
    return gate;
  }
  try {
    const result = await getProductFoodCost(gate.tenantUuid, productId);
    if (!result) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("[GET productos costo-comida]", e);
    return NextResponse.json(
      { error: "No se pudo calcular el costo" },
      { status: 500 },
    );
  }
}
