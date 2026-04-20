import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireOrderStaff,
} from "@/lib/api-tenant-session";
import { updateReservation } from "@/lib/db/reservations";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const idField = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export async function PATCH(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) return denied;

  if (!idField.safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  try {
    const reservation = await updateReservation(gate.tenantUuid, id, {
      status: "confirmada",
    });
    return NextResponse.json(reservation);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Reserva no encontrada") {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }
    console.error("[PATCH reservas/[id]/confirmar]", e);
    return NextResponse.json(
      { error: "Error al confirmar la reserva" },
      { status: 500 },
    );
  }
}
