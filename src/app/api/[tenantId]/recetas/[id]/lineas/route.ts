import { NextResponse } from "next/server";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { addRecipeItem } from "@/lib/db/recipes";
import { recipeItemBodySchema } from "@/lib/recipes-api-schemas";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId, id: recipeId } = await ctx.params;
  const gate = await getTenantSession(tenantId);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }
  const raw = await request.json().catch(() => null);
  const parsed = recipeItemBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const it = parsed.data;
  try {
    const item = await addRecipeItem(
      gate.tenantUuid,
      recipeId,
      it.ingredient_id
        ? {
            ingredient_id: it.ingredient_id,
            quantity: it.quantity,
            unit: it.unit,
            notes: it.notes ?? null,
          }
        : {
            sub_recipe_id: it.sub_recipe_id!,
            quantity: it.quantity,
            unit: it.unit,
            notes: it.notes ?? null,
          },
    );
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    console.error("[POST recipe items]", e);
    const msg = e instanceof Error ? e.message : "";
    return NextResponse.json(
      { error: msg || "Error al agregar ítem" },
      { status: 400 },
    );
  }
}
