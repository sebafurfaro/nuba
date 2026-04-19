import { NextResponse } from "next/server";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import {
  getIngredientById,
  updateIngredient,
} from "@/lib/db/recipes";
import { updateIngredientSchema } from "@/lib/recipes-api-schemas";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

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
  const parsed = updateIngredientSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const row = await updateIngredient(gate.tenantUuid, id, parsed.data);
    return NextResponse.json(row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("no encontrado")) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    console.error("[PUT ingredients]", e);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { tenantId, id } = await ctx.params;
  const gate = await getTenantSession(tenantId);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }
  const existing = await getIngredientById(gate.tenantUuid, id);
  if (!existing) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  try {
    await updateIngredient(gate.tenantUuid, id, { is_active: false });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("[DELETE ingredients]", e);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
