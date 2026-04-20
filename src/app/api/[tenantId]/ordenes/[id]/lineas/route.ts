import { NextResponse } from "next/server";
import { z } from "zod";

import { getTenantSession, requireOrderStaff } from "@/lib/api-tenant-session";
import { addOrderItem } from "@/lib/db/orders";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const bodySchema = z.object({
  product_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  variant_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).optional(),
  quantity: z.number().int().positive(),
  notes: z.string().max(500).optional(),
});

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id: orderId } = await ctx.params;
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
    const item = await addOrderItem(gate.tenantUuid, orderId, parsed.data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al agregar ítem";
    if (msg.includes("cerrada")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg.includes("no encontrado")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[POST orders/[id]/items]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
