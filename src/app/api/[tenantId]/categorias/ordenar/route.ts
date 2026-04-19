import { NextResponse } from "next/server";

import { getTenantSession } from "@/lib/api-tenant-session";
import { sortCategoriesBodySchema } from "@/lib/category-api-schemas";
import { updateSortOrder } from "@/lib/db/categories";

type Ctx = { params: Promise<{ tenantId: string }> };

/** Cualquier usuario autenticado del tenant puede reordenar (drag & drop). */
export async function PATCH(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }

  const raw = await request.json().catch(() => null);
  const parsed = sortCategoriesBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await updateSortOrder(gate.tenantUuid, parsed.data.items);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PATCH categorias/sort]", e);
    const msg = e instanceof Error ? e.message : "";
    return NextResponse.json(
      { error: msg || "Error al actualizar orden" },
      { status: 500 },
    );
  }
}
