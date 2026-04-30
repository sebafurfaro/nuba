import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
  requireAdminOrSupervisor,
} from "@/lib/api-tenant-session";
import {
  createPurchaseOrder,
  getPurchaseOrders,
} from "@/lib/db/purchase-orders";

type Ctx = { params: Promise<{ tenantId: string }> };

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const itemSchema = z.object({
  ingredient_id: uuidSchema,
  quantity: z.number().positive("La cantidad debe ser mayor a 0"),
  unit_price: z.number().min(0, "El precio debe ser mayor o igual a 0"),
});

const createOrderSchema = z.object({
  supplier_id: uuidSchema,
  expected_date: z.string().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  items: z.array(itemSchema).min(1, "La orden debe tener al menos un ítem"),
});

export async function GET(request: NextRequest, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) return denied;

  const { searchParams } = request.nextUrl;
  const filters = {
    supplierId: searchParams.get("supplierId") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    desde: searchParams.get("desde") ?? undefined,
    hasta: searchParams.get("hasta") ?? undefined,
  };

  try {
    const orders = await getPurchaseOrders(gate.tenantUuid, filters);
    return NextResponse.json(orders);
  } catch (e) {
    console.error("[GET ordenes-compra]", e);
    return NextResponse.json(
      { error: "Error al listar órdenes de compra" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  const raw = await request.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const order = await createPurchaseOrder(gate.tenantUuid, parsed.data);
    return NextResponse.json(order, { status: 201 });
  } catch (e) {
    console.error("[POST ordenes-compra]", e);
    return NextResponse.json(
      { error: "Error al crear la orden de compra" },
      { status: 500 },
    );
  }
}
