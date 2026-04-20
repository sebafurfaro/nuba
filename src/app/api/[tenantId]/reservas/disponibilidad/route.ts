import { NextResponse } from "next/server";

import {
  getTenantSession,
  requireOrderStaff,
} from "@/lib/api-tenant-session";
import { getAvailableTables } from "@/lib/db/reservations";

type Ctx = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const time = searchParams.get("time");
  const partySizeRaw = searchParams.get("partySize");
  const durationMin = Number(searchParams.get("durationMin") ?? "90");
  const branchId = searchParams.get("branchId") ?? undefined;

  if (!date || !time || !partySizeRaw) {
    return NextResponse.json(
      { error: "date, time y partySize son requeridos" },
      { status: 400 },
    );
  }

  const partySize = Number(partySizeRaw);
  if (!Number.isInteger(partySize) || partySize < 1) {
    return NextResponse.json(
      { error: "partySize debe ser un entero positivo" },
      { status: 400 },
    );
  }

  try {
    const tables = await getAvailableTables(
      gate.tenantUuid,
      date,
      time,
      durationMin,
      partySize,
      branchId,
    );
    return NextResponse.json(tables);
  } catch (e) {
    console.error("[GET reservas/disponibilidad]", e);
    return NextResponse.json(
      { error: "Error al consultar disponibilidad" },
      { status: 500 },
    );
  }
}
