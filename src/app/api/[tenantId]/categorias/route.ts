import { NextResponse } from "next/server";
import type { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { createCategoryBodySchema } from "@/lib/category-api-schemas";
import { createCategory, getCategoryTree } from "@/lib/db/categories";

type Ctx = { params: Promise<{ tenantId: string }> };

function mapCreateBody(raw: z.output<typeof createCategoryBodySchema>) {
  const parent =
    raw.parent_id && String(raw.parent_id).trim() !== ""
      ? String(raw.parent_id).trim()
      : null;
  return {
    name: raw.name.trim(),
    description:
      raw.description === undefined
        ? undefined
        : raw.description === null || String(raw.description).trim() === ""
          ? null
          : String(raw.description).trim(),
    image_url:
      raw.image_url === undefined
        ? undefined
        : raw.image_url === null || String(raw.image_url).trim() === ""
          ? null
          : String(raw.image_url).trim(),
    parent_id: parent,
    sort_order: raw.sort_order,
  };
}

/** GET: árbol de categorías (sesión + tenant vía `getTenantSession` → `auth()` + `tenantId`). */
export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  try {
    const tree = await getCategoryTree(gate.tenantUuid);
    return NextResponse.json(tree);
  } catch (e) {
    console.error("[GET categorias]", e);
    return NextResponse.json(
      { error: "Error al cargar categorías" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }

  const raw = await request.json().catch(() => null);
  const parsed = createCategoryBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const created = await createCategory(
      gate.tenantUuid,
      mapCreateBody(parsed.data),
    );
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (
      msg.includes("No se puede anidar") ||
      msg.includes("padre no encontrada") ||
      msg.includes("obligatorio")
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[POST categorias]", e);
    return NextResponse.json(
      { error: msg || "Error al crear categoría" },
      { status: 500 },
    );
  }
}
