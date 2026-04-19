import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import {
  deleteOrderStatusRow,
  updateOrderStatusDefinition,
  type UpdateOrderStatusDefinitionInput,
} from "@/lib/db/order-config";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const updateStatusBodySchema = z
  .object({
    label: z.string().min(1).max(100).optional(),
    color: z.string().min(4).max(7).optional(),
    sort_order: z.number().int().optional(),
    triggers_stock: z.boolean().optional(),
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
  const parsed = updateStatusBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const patch = parsed.data as UpdateOrderStatusDefinitionInput;
  try {
    await updateOrderStatusDefinition(gate.tenantUuid, id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar";
    const status = msg.includes("no encontrado") ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireAdmin(gate.session.user.role);
  if (denied) {
    return denied;
  }
  try {
    const result = await deleteOrderStatusRow(gate.tenantUuid, id);
    if (result === "in_use") {
      return NextResponse.json(
        { error: "Hay órdenes con este estado; no se puede eliminar." },
        { status: 409 },
      );
    }
    if (result === "not_found") {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("[DELETE order-statuses]", e);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
