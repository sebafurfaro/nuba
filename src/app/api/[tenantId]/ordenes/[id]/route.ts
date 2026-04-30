import { NextResponse } from "next/server";

import { getTenantSession, requireAdminOrSupervisor, requireOrderStaff } from "@/lib/api-tenant-session";
import { deleteOrder, getOrderById } from "@/lib/db/orders";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) {
    return denied;
  }
  try {
    const order = await getOrderById(gate.tenantUuid, id);
    if (!order) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (e) {
    console.error("[GET orders/[id]]", e);
    return NextResponse.json({ error: "Error al cargar la orden" }, { status: 500 });
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
    await deleteOrder(gate.tenantUuid, id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al eliminar";
    if (msg.includes("terminal")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg.includes("no encontrada")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("[DELETE orders/[id]]", e);
    return NextResponse.json({ error: "Error al eliminar la orden" }, { status: 500 });
  }
}
