import { NextResponse } from "next/server";
import { z } from "zod";

import { getTenantSession, requireOrderStaff } from "@/lib/api-tenant-session";
import { createOrder, getOrders } from "@/lib/db/orders";
import type { CreateOrderInput, OrderType } from "@/types/order";

type Ctx = { params: Promise<{ tenantId: string }> };

const orderTypeSchema = z.enum(["dine_in", "takeaway", "delivery", "online"]);

const createOrderItemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional(),
  quantity: z.number().int().positive(),
  notes: z.string().max(500).optional(),
});

const createOrderBodySchema = z.object({
  location_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  customer_name: z.string().max(255).nullable().optional(),
  customer_phone: z.string().max(50).nullable().optional(),
  delivery_address: z.string().max(5000).nullable().optional(),
  type: orderTypeSchema,
  notes: z.string().max(10000).optional(),
  items: z.array(createOrderItemSchema).min(1),
});

export async function GET(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) {
    return denied;
  }
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId") ?? undefined;
  const statusKey = searchParams.get("statusKey") ?? undefined;
  const typeRaw = searchParams.get("type");
  let type: OrderType | undefined;
  if (typeRaw) {
    const p = orderTypeSchema.safeParse(typeRaw);
    if (!p.success) {
      return NextResponse.json({ error: "type inválido" }, { status: 400 });
    }
    type = p.data;
  }
  const includeTerminal =
    searchParams.get("includeTerminal") === "true" ||
    searchParams.get("includeTerminal") === "1";
  try {
    const orders = await getOrders(
      gate.tenantUuid,
      { location_id: locationId, status_key: statusKey, type },
      includeTerminal,
    );
    return NextResponse.json({ orders });
  } catch (e) {
    console.error("[GET orders]", e);
    return NextResponse.json({ error: "Error al listar órdenes" }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) {
    return denied;
  }
  const raw = await request.json().catch(() => null);
  const parsed = createOrderBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;
  const input: CreateOrderInput = {
    location_id: b.location_id,
    customer_id: b.customer_id,
    customer_name: b.customer_name ?? undefined,
    customer_phone: b.customer_phone ?? undefined,
    delivery_address: b.delivery_address ?? undefined,
    type: b.type,
    notes: b.notes,
    items: b.items.map((i) => ({
      product_id: i.product_id,
      variant_id: i.variant_id,
      quantity: i.quantity,
      notes: i.notes,
    })),
  };
  try {
    const order = await createOrder(
      gate.tenantUuid,
      gate.session.user.id,
      input,
    );
    return NextResponse.json({ order }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al crear orden";
    if (msg.includes("ya tiene una orden activa")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg.includes("no encontrad") || msg.includes("inválid")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[POST orders]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
