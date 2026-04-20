import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireOrderStaff,
} from "@/lib/api-tenant-session";
import { isDateBlocked } from "@/lib/db/blocked-dates";
import {
  createReservation,
  getReservations,
} from "@/lib/db/reservations";
import { getFeatureFlags } from "@/lib/db/tenant";
import { TableUnavailableError } from "@/types/reservation";

type Ctx = { params: Promise<{ tenantId: string }> };

const idField = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const createReservationSchema = z.object({
  branch_id: idField.optional().nullable(),
  table_id: idField.optional().nullable(),
  customer_id: idField.optional().nullable(),
  customer_name: z.string().min(1, "El nombre es requerido").max(255),
  customer_phone: z.string().optional().nullable(),
  customer_email: z
    .string()
    .email()
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => v || null),
  party_size: z.number().int().min(1).max(50),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  duration_min: z.number().int().min(30).max(480).default(90),
  notes: z.string().max(500).optional().nullable(),
  created_by: z.enum(["admin", "client"]).default("admin"),
});

export async function GET(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const filters = {
    branchId: searchParams.get("branchId") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    status: (searchParams.get("status") as Parameters<typeof getReservations>[1] extends { status?: infer S } ? S : never) ?? undefined,
    tableId: searchParams.get("tableId") ?? undefined,
  };

  try {
    const reservations = await getReservations(gate.tenantUuid, filters);
    return NextResponse.json(reservations);
  } catch (e) {
    console.error("[GET reservas]", e);
    return NextResponse.json({ error: "Error al cargar las reservas" }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) return denied;

  const raw = await request.json().catch(() => null);
  const parsed = createReservationSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    // Check holiday blocking feature flag
    const flags = await getFeatureFlags(gate.tenantUuid);
    const holidayBlocking =
      flags.find((f) => f.flag_key === "enable_holiday_blocking")?.is_enabled ??
      false;

    if (holidayBlocking) {
      const blocked = await isDateBlocked(gate.tenantUuid, parsed.data.date);
      if (blocked) {
        return NextResponse.json(
          { error: "No se pueden crear reservas en días bloqueados" },
          { status: 409 },
        );
      }
    }

    const reservation = await createReservation(gate.tenantUuid, parsed.data);
    return NextResponse.json(reservation, { status: 201 });
  } catch (e) {
    if (e instanceof TableUnavailableError) {
      return NextResponse.json(
        { error: "La mesa no está disponible en ese horario" },
        { status: 409 },
      );
    }
    console.error("[POST reservas]", e);
    return NextResponse.json({ error: "Error al crear la reserva" }, { status: 500 });
  }
}
