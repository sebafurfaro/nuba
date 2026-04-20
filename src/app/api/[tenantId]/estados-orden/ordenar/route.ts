import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import { bulkUpdateOrderStatusSortOrder } from "@/lib/db/order-config";

type Ctx = { params: Promise<{ tenantId: string }> };

const sortBodySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
        sort_order: z.number().int(),
      }),
    )
    .min(1),
});

export async function PATCH(request: Request, ctx: Ctx) {
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
  const parsed = sortBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    await bulkUpdateOrderStatusSortOrder(gate.tenantUuid, parsed.data.items);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al ordenar";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
