import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
} from "@/lib/api-tenant-session";
import { receivePurchaseOrder } from "@/lib/db/purchase-orders";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export async function POST(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  try {
    const result = await receivePurchaseOrder(gate.tenantUuid, id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "NOT_FOUND") {
        return NextResponse.json(
          { error: "Orden no encontrada" },
          { status: 404 },
        );
      }
      if (e.message === "ALREADY_RECEIVED") {
        return NextResponse.json(
          { error: "La orden ya fue recibida" },
          { status: 409 },
        );
      }
      if (e.message === "IS_CANCELLED") {
        return NextResponse.json(
          { error: "No se puede recibir una orden cancelada" },
          { status: 409 },
        );
      }
    }
    console.error("[POST ordenes-compra/[id]/recibir]", e);
    return NextResponse.json(
      { error: "Error al procesar la recepción de la orden" },
      { status: 500 },
    );
  }
}
