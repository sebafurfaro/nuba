import { NextResponse } from "next/server";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import {
  type AddRecipeItemInput,
  createRecipeWithItems,
  getRecipes,
} from "@/lib/db/recipes";
import { createRecipeSchema } from "@/lib/recipes-api-schemas";

type Ctx = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { tenantId } = await ctx.params;
  const gate = await getTenantSession(tenantId);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const { searchParams } = new URL(request.url);
  const sub = searchParams.get("subRecipe");
  const filters =
    sub === "true"
      ? { isSubRecipe: true as const }
      : sub === "false"
        ? { isSubRecipe: false as const }
        : undefined;
  try {
    const list = await getRecipes(gate.tenantUuid, filters);
    return NextResponse.json(list);
  } catch (e) {
    console.error("[GET recipes]", e);
    return NextResponse.json(
      { error: "Error al listar recetas" },
      { status: 500 },
    );
  }
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
  const parsed = createRecipeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { items, ...recipe } = parsed.data;
  const mapped: AddRecipeItemInput[] = items.map((it) => {
    if (it.ingredient_id) {
      return {
        ingredient_id: it.ingredient_id,
        quantity: it.quantity,
        unit: it.unit,
        notes: it.notes ?? null,
      };
    }
    return {
      sub_recipe_id: it.sub_recipe_id!,
      quantity: it.quantity,
      unit: it.unit,
      notes: it.notes ?? null,
    };
  });
  try {
    const full = await createRecipeWithItems(gate.tenantUuid, recipe, mapped);
    return NextResponse.json(full, { status: 201 });
  } catch (e) {
    console.error("[POST recipes]", e);
    const msg = e instanceof Error ? e.message : "";
    return NextResponse.json(
      { error: msg || "Error al crear receta" },
      { status: 400 },
    );
  }
}
