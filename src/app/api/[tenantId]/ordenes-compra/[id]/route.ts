import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import {
  getPurchaseOrderById,
  updatePurchaseOrder,
} from "@/lib/db/purchase-orders";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const itemSchema = z.object({
  ingredient_id: uuidSchema,
  quantity: z.number().positive(),
  unit_price: z.number().min(0),
});

const updateOrderSchema = z.object({
  expected_date: z.string().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  status: z.enum(["draft", "sent", "cancelled"]).optional(),
  items: z.array(itemSchema).min(1).optional(),
});

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) return denied;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  try {
    const order = await getPurchaseOrderById(gate.tenantUuid, id);
    if (!order) {
      return NextResponse.json(
        { error: "Orden de compra no encontrada" },
        { status: 404 },
      );
    }
    return NextResponse.json(order);
  } catch (e) {
    console.error("[GET ordenes-compra/[id]]", e);
    return NextResponse.json(
      { error: "Error al obtener la orden de compra" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = updateOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const order = await updatePurchaseOrder(gate.tenantUuid, id, parsed.data);
    return NextResponse.json(order);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "NOT_FOUND") {
        return NextResponse.json(
          { error: "Orden no encontrada" },
          { status: 404 },
        );
      }
      if (e.message === "CANNOT_EDIT_ITEMS") {
        return NextResponse.json(
          { error: "Solo se pueden editar ítems en órdenes en borrador" },
          { status: 409 },
        );
      }
      if (e.message === "ALREADY_RECEIVED") {
        return NextResponse.json(
          { error: "No se puede modificar una orden ya recibida" },
          { status: 409 },
        );
      }
    }
    console.error("[PATCH ordenes-compra/[id]]", e);
    return NextResponse.json(
      { error: "Error al actualizar la orden de compra" },
      { status: 500 },
    );
  }
}
