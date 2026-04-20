import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
} from "@/lib/api-tenant-session";
import { reactivateSupplier } from "@/lib/db/suppliers";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export async function PATCH(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  try {
    await reactivateSupplier(gate.tenantUuid, id);
    return NextResponse.json({ message: "Proveedor reactivado" });
  } catch (e) {
    console.error("[PATCH proveedores/[id]/reactivar]", e);
    return NextResponse.json(
      { error: "Error al reactivar el proveedor" },
      { status: 500 },
    );
  }
}
