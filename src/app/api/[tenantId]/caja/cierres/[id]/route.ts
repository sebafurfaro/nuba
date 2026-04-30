import { NextResponse } from "next/server";

import { getTenantSession, requireAdminOrSupervisor } from "@/lib/api-tenant-session";
import { getCierreCajaById } from "@/lib/db/caja";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) return denied;

  try {
    const cierre = await getCierreCajaById(gate.tenantUuid, id);
    if (!cierre) {
      return NextResponse.json({ error: "Cierre no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ cierre });
  } catch (e) {
    console.error("[GET caja/cierres/[id]]", e);
    return NextResponse.json({ error: "Error al obtener cierre" }, { status: 500 });
  }
}
