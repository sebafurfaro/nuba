import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { createProductVariant } from "@/lib/db/products";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  sku: z.string().max(100).nullable().optional(),
  price: z.number().nonnegative().nullable().optional(),
  stock: z.number().int().min(0),
});

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id: productId } = await ctx.params;
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

  let variantId: string;
  try {
    variantId = await createProductVariant(gate.tenantUuid, productId, {
      name: b.name,
      sku: b.sku ?? null,
      price: b.price ?? null,
      stock: b.stock,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "PRODUCT_NOT_FOUND") {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    const code = (e as { code?: string })?.code;
    if (code === "ER_DUP_ENTRY") {
      return NextResponse.json(
        { error: "SKU de variación duplicado" },
        { status: 409 },
      );
    }
    console.error("[POST variant]", e);
    return NextResponse.json({ error: "Error al crear variación" }, { status: 500 });
  }

  return NextResponse.json({ id: variantId }, { status: 201 });
}
