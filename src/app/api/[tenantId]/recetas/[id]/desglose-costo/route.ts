import { NextResponse } from "next/server";

import { getTenantSession } from "@/lib/api-tenant-session";
import { getRecipeCostBreakdown } from "@/lib/db/recipes";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  try {
    const breakdown = await getRecipeCostBreakdown(gate.tenantUuid, id);
    return NextResponse.json(breakdown);
  } catch (e) {
    console.error("[GET recipes cost-breakdown]", e);
    return NextResponse.json(
      { error: "No se pudo calcular la receta" },
      { status: 500 },
    );
  }
}
