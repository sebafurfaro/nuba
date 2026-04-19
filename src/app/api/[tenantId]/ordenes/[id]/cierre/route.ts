import { NextResponse } from "next/server";
import { z } from "zod";

import { getTenantSession, requireOrderStaff } from "@/lib/api-tenant-session";
import { closeOrder } from "@/lib/db/orders";
import type { CloseOrderPaymentInput } from "@/types/order";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const paymentMethodSchema = z.enum([
  "cash",
  "mercadopago",
  "card",
  "transfer",
]);

const bodySchema = z.object({
  method: paymentMethodSchema,
  amount: z.number().positive(),
});

function mapPaymentMethod(
  m: z.infer<typeof paymentMethodSchema>,
): CloseOrderPaymentInput["method"] {
  switch (m) {
    case "cash":
      return "efectivo";
    case "mercadopago":
      return "mercadopago";
    case "card":
      return "tarjeta";
    case "transfer":
      return "transferencia";
    default:
      return "otro";
  }
}

export async function POST(request: Request, ctx: Ctx) {
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
  const payment: CloseOrderPaymentInput = {
    method: mapPaymentMethod(parsed.data.method),
    amount: parsed.data.amount,
  };
  try {
    const order = await closeOrder(gate.tenantUuid, id, payment);
    return NextResponse.json({ order });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cerrar orden";
    if (msg.includes("no encontrada") || msg.includes("no configurado")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[POST orders/[id]/close]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
