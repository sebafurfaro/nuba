import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireOrderStaff,
} from "@/lib/api-tenant-session";
import {
  getReservationById,
  updateReservation,
} from "@/lib/db/reservations";
import { TableUnavailableError } from "@/types/reservation";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

const idField = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const updateReservationSchema = z.object({
  branch_id: idField.optional().nullable(),
  table_id: idField.optional().nullable(),
  customer_id: idField.optional().nullable(),
  customer_name: z.string().min(1).max(255).optional(),
  customer_phone: z.string().optional().nullable(),
  customer_email: z
    .string()
    .email()
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => v || null),
  party_size: z.number().int().min(1).max(50).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  duration_min: z.number().int().min(30).max(480).optional(),
  notes: z.string().max(500).optional().nullable(),
  status: z
    .enum(["pendiente", "confirmada", "cancelada", "completada", "no_show"])
    .optional(),
});

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) return denied;

  if (!idField.safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  try {
    const reservation = await getReservationById(gate.tenantUuid, id);
    if (!reservation) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }
    return NextResponse.json(reservation);
  } catch (e) {
    console.error("[GET reservas/[id]]", e);
    return NextResponse.json({ error: "Error al cargar la reserva" }, { status: 500 });
  }
}

export async function PUT(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) return denied;

  if (!idField.safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = updateReservationSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const reservation = await updateReservation(gate.tenantUuid, id, parsed.data);
    return NextResponse.json(reservation);
  } catch (e) {
    if (e instanceof TableUnavailableError) {
      return NextResponse.json(
        { error: "La mesa no está disponible en ese horario" },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Reserva no encontrada") {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }
    console.error("[PUT reservas/[id]]", e);
    return NextResponse.json({ error: "Error al actualizar la reserva" }, { status: 500 });
  }
}
