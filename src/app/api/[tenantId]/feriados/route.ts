import { NextResponse } from "next/server";

import {
  getTenantSession,
  requireOrderStaff,
} from "@/lib/api-tenant-session";
import { getBlockedDates } from "@/lib/db/blocked-dates";

type Ctx = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  if (!dateFrom || !dateTo) {
    return NextResponse.json(
      { error: "dateFrom y dateTo son requeridos" },
      { status: 400 },
    );
  }

  try {
    const blocked = await getBlockedDates(gate.tenantUuid, dateFrom, dateTo);
    return NextResponse.json(blocked);
  } catch (e) {
    console.error("[GET feriados]", e);
    return NextResponse.json(
      { error: "Error al cargar los días bloqueados" },
      { status: 500 },
    );
  }
}
