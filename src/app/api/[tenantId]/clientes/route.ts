import { NextResponse } from "next/server";

import { getTenantSession, requireOrderStaff } from "@/lib/api-tenant-session";
import { getCustomers } from "@/lib/db/customers";

type Ctx = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) {
    return denied;
  }
  try {
    const customers = await getCustomers(gate.tenantUuid);
    return NextResponse.json({ customers });
  } catch (e) {
    console.error("[GET clientes]", e);
    return NextResponse.json({ error: "Error al listar clientes" }, { status: 500 });
  }
}
