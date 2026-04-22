import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { removeRecipeItem, updateRecipeItem } from "@/lib/db/recipes";
import { unitTypeSchema } from "@/lib/recipes-api-schemas";

type Ctx = { params: Promise<{ tenantId: string; id: string; lineaId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const { tenantId, id: recipeId, lineaId: itemId } = await ctx.params;
  const gate = await getTenantSession(tenantId);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }
  const raw = await request.json().catch(() => null);
  const parsed = z
    .object({ quantity: z.number().positive(), unit: unitTypeSchema })
    .safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  try {
    await updateRecipeItem(gate.tenantUuid, recipeId, itemId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("no encontrado")) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    console.error("[PATCH recipe item]", e);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { tenantId, id: recipeId, lineaId: itemId } = await ctx.params;
  const gate = await getTenantSession(tenantId);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }
  try {
    await removeRecipeItem(gate.tenantUuid, recipeId, itemId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("no encontrado")) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    console.error("[DELETE recipe item]", e);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
