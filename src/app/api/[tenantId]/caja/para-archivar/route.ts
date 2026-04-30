import { NextResponse } from "next/server";

import { getTenantSession, requireOrderStaff } from "@/lib/api-tenant-session";
import { getOrdenesParaArchivar } from "@/lib/db/caja";

type Ctx = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) return denied;

  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? undefined;

  try {
    const ordenes = await getOrdenesParaArchivar(gate.tenantUuid, branchId);
    return NextResponse.json({ ordenes });
  } catch (e) {
    console.error("[GET caja/para-archivar]", e);
    return NextResponse.json({ error: "Error al obtener órdenes" }, { status: 500 });
  }
}
