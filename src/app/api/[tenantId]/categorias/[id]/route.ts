import { NextResponse } from "next/server";
import type { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { updateCategoryBodySchema } from "@/lib/category-api-schemas";
import {
  deleteCategory,
  getCategoryById,
  updateCategory,
} from "@/lib/db/categories";
import type { UpdateCategoryInput } from "@/lib/db/categories";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

function toUpdateInput(
  raw: z.infer<typeof updateCategoryBodySchema>,
): UpdateCategoryInput {
  const out: UpdateCategoryInput = {};
  if (raw.name !== undefined) {
    out.name = raw.name.trim();
  }
  if (raw.description !== undefined) {
    out.description =
      raw.description === null || String(raw.description).trim() === ""
        ? null
        : String(raw.description).trim();
  }
  if (raw.image_url !== undefined) {
    out.image_url =
      raw.image_url === null || String(raw.image_url).trim() === ""
        ? null
        : String(raw.image_url).trim();
  }
  if (raw.parent_id !== undefined) {
    out.parent_id =
      raw.parent_id && String(raw.parent_id).trim() !== ""
        ? String(raw.parent_id).trim()
        : null;
  }
  if (raw.sort_order !== undefined) {
    out.sort_order = raw.sort_order;
  }
  if (raw.is_active !== undefined) {
    out.is_active = raw.is_active;
  }
  return out;
}

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const row = await getCategoryById(gate.tenantUuid, id);
  if (!row) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function PUT(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }

  const raw = await request.json().catch(() => null);
  const parsed = updateCategoryBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Sin campos para actualizar" }, { status: 400 });
  }

  try {
    const updated = await updateCategory(
      gate.tenantUuid,
      id,
      toUpdateInput(parsed.data),
    );
    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (
      msg.includes("No se puede anidar") ||
      msg.includes("padre no encontrada") ||
      msg.includes("No se puede convertir") ||
      msg.includes("padre de sí misma")
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes("no encontrada")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("[PUT categorias id]", e);
    return NextResponse.json(
      { error: msg || "Error al actualizar" },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }

  try {
    await deleteCategory(gate.tenantUuid, id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (
      msg.includes("Eliminá las subcategorías") ||
      msg.includes("Reasigná los productos")
    ) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg.includes("no encontrada")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("[DELETE categorias id]", e);
    return NextResponse.json(
      { error: msg || "Error al eliminar" },
      { status: 500 },
    );
  }
}
