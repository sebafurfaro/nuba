import { NextResponse } from "next/server";
import { z } from "zod";

import { getTenantSession, requireOrderStaff } from "@/lib/api-tenant-session";
import { updateOrderStatus } from "@/lib/db/orders";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const bodySchema = z.object({
  status_key: z.string().min(1).max(50),
});

export async function PATCH(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireOrderStaff(gate.session.user.role);
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
  try {
    const order = await updateOrderStatus(
      gate.tenantUuid,
      id,
      parsed.data.status_key,
    );
    return NextResponse.json({ order });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar estado";
    if (msg.includes("no encontrada") || msg.includes("no válido")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes("terminal")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    console.error("[PATCH orders/[id]/status]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
