import { NextResponse } from "next/server";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import {
  createIngredient,
  getIngredients,
} from "@/lib/db/recipes";
import { createIngredientSchema } from "@/lib/recipes-api-schemas";

type Ctx = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { tenantId } = await ctx.params;
  const gate = await getTenantSession(tenantId);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get("branchId") ?? undefined;
  const includeInactive = searchParams.get("includeInactive") === "true";
  const list = await getIngredients(gate.tenantUuid, branchId, {
    activeOnly: !includeInactive,
  });
  return NextResponse.json(list);
}

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId } = await ctx.params;
  const gate = await getTenantSession(tenantId);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }
  const raw = await request.json().catch(() => null);
  const parsed = createIngredientSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const row = await createIngredient(gate.tenantUuid, parsed.data);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    console.error("[POST ingredients]", e);
    return NextResponse.json({ error: "Error al crear" }, { status: 500 });
  }
}
