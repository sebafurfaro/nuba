import { NextResponse } from "next/server";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { getRecipeById, updateRecipe } from "@/lib/db/recipes";
import { updateRecipeSchema } from "@/lib/recipes-api-schemas";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId, id } = await ctx.params;
  const gate = await getTenantSession(tenantId);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const full = await getRecipeById(gate.tenantUuid, id);
  if (!full) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json(full);
}

export async function PUT(request: Request, ctx: Ctx) {
  const { tenantId, id } = await ctx.params;
  const gate = await getTenantSession(tenantId);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }
  const raw = await request.json().catch(() => null);
  const parsed = updateRecipeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const row = await updateRecipe(gate.tenantUuid, id, parsed.data);
    const full = await getRecipeById(gate.tenantUuid, row.id);
    if (!full) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json(full);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("no encontrada")) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    console.error("[PUT recipes]", e);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}
