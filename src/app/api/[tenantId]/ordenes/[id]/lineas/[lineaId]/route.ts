import { NextResponse } from "next/server";

import { getTenantSession, requireOrderStaff } from "@/lib/api-tenant-session";
import { removeOrderItem } from "@/lib/db/orders";

type Ctx = { params: Promise<{ tenantId: string; id: string; lineaId: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id: orderId, lineaId: itemId } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) {
    return denied;
  }
  try {
    await removeOrderItem(gate.tenantUuid, orderId, itemId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al eliminar ítem";
    if (msg.includes("cerrada")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg.includes("no encontrado")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("[DELETE ordenes/.../lineas]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
