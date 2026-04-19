import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { deleteProductVariant, updateProductVariant } from "@/lib/db/products";

type Ctx = {
  params: Promise<{ tenantId: string; id: string; variacionId: string }>;
};

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  sku: z.string().max(100).nullable().optional(),
  price: z.number().nonnegative().nullable().optional(),
  stock: z.number().int().min(0),
});

export async function PUT(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id: productId, variacionId: variantId } =
    await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;

  try {
    const { affectedRows } = await updateProductVariant(
      gate.tenantUuid,
      productId,
      variantId,
      {
        name: b.name,
        sku: b.sku ?? null,
        price: b.price ?? null,
        stock: b.stock,
      },
    );
    if (affectedRows === 0) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "ER_DUP_ENTRY") {
      return NextResponse.json(
        { error: "SKU de variación duplicado" },
        { status: 409 },
      );
    }
    console.error("[PUT variant]", e);
    return NextResponse.json({ error: "Error al actualizar variación" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id: productId, variacionId: variantId } =
    await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) {
    return denied;
  }

  try {
    const { affectedRows } = await deleteProductVariant(
      gate.tenantUuid,
      productId,
      variantId,
    );
    if (affectedRows === 0) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
  } catch (e) {
    console.error("[DELETE variant]", e);
    return NextResponse.json({ error: "Error al eliminar variación" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
