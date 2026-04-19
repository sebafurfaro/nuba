import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import {
  deleteLocationRow,
  updateLocationRow,
  type UpdateLocationInput,
} from "@/lib/db/order-config";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const locationTypeEnum = z.enum([
  "table",
  "counter",
  "takeaway",
  "delivery",
  "online",
]);

const updateLocationBodySchema = z
  .object({
    branch_id: z.string().uuid().nullable().optional(),
    table_id: z.string().uuid().nullable().optional(),
    type: locationTypeEnum.optional(),
    name: z.string().min(1).max(100).optional(),
    capacity: z.number().int().min(0).nullable().optional(),
    is_active: z.boolean().optional(),
    is_reservable: z.boolean().optional(),
    accepts_queue: z.boolean().optional(),
    sort_order: z.number().int().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Vacío" });

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
  const parsed = updateLocationBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const patch = parsed.data as UpdateLocationInput;
  try {
    await updateLocationRow(gate.tenantUuid, id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar";
    const status = msg.includes("no encontrada") ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
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
    const result = await deleteLocationRow(gate.tenantUuid, id);
    if (result === "has_active_orders") {
      return NextResponse.json(
        { error: "La location tiene órdenes activas" },
        { status: 409 },
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al eliminar";
    const status = msg.includes("no encontrada") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
