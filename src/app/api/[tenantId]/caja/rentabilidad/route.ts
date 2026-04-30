import { NextResponse } from "next/server";

import { getTenantSession, requireAdminOrSupervisor } from "@/lib/api-tenant-session";
import { getRentabilidad } from "@/lib/db/caja";

type Ctx = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) return denied;

  const url = new URL(request.url);
  const q = url.searchParams;
  const desde = q.get("desde");
  const hasta = q.get("hasta");

  if (!desde || !hasta) {
    return NextResponse.json(
      { error: "Se requieren los parámetros 'desde' y 'hasta'" },
      { status: 400 },
    );
  }

  try {
    const data = await getRentabilidad(
      gate.tenantUuid,
      desde,
      hasta,
      q.get("branchId") ?? undefined,
    );
    return NextResponse.json(data);
  } catch (e) {
    console.error("[GET caja/rentabilidad]", e);
    return NextResponse.json({ error: "Error al obtener rentabilidad" }, { status: 500 });
  }
}
