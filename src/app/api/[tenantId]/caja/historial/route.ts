import { NextResponse } from "next/server";

import { getTenantSession, requireOrderStaff } from "@/lib/api-tenant-session";
import { getOrdenesHistorial } from "@/lib/db/caja";

type Ctx = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) return denied;

  const url = new URL(request.url);
  const q = url.searchParams;

  try {
    const result = await getOrdenesHistorial(gate.tenantUuid, {
      branchId: q.get("branchId") ?? undefined,
      desde: q.get("desde") ?? undefined,
      hasta: q.get("hasta") ?? undefined,
      statusKey: q.get("statusKey") ?? undefined,
      metodoPago: q.get("metodoPago") ?? undefined,
      page: q.has("page") ? Number(q.get("page")) : undefined,
      limit: q.has("limit") ? Number(q.get("limit")) : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[GET caja/historial]", e);
    return NextResponse.json({ error: "Error al obtener historial" }, { status: 500 });
  }
}
