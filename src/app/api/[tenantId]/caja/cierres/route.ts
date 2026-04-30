import { NextResponse } from "next/server";

import { getTenantSession, requireAdminOrSupervisor } from "@/lib/api-tenant-session";
import { getCierresCaja } from "@/lib/db/caja";

type Ctx = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) return denied;

  const url = new URL(request.url);
  const q = url.searchParams;

  try {
    const result = await getCierresCaja(gate.tenantUuid, {
      branchId: q.get("branchId") ?? undefined,
      desde: q.get("desde") ?? undefined,
      hasta: q.get("hasta") ?? undefined,
      page: q.has("page") ? Number(q.get("page")) : undefined,
      limit: q.has("limit") ? Number(q.get("limit")) : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[GET caja/cierres]", e);
    return NextResponse.json({ error: "Error al obtener cierres" }, { status: 500 });
  }
}
