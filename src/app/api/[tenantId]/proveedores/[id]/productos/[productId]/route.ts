import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
} from "@/lib/api-tenant-session";
import { removeSupplierProduct } from "@/lib/db/suppliers";

type Ctx = {
  params: Promise<{ tenantId: string; id: string; productId: string }>;
};

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export async function DELETE(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id, productId } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  if (!uuidSchema.safeParse(productId).success) {
    return NextResponse.json({ error: "productId inválido" }, { status: 400 });
  }

  try {
    await removeSupplierProduct(gate.tenantUuid, id, productId);
    return NextResponse.json({ message: "Producto eliminado del proveedor" });
  } catch (e) {
    console.error("[DELETE proveedores/[id]/productos/[productId]]", e);
    return NextResponse.json(
      { error: "Error al eliminar el producto del proveedor" },
      { status: 500 },
    );
  }
}
