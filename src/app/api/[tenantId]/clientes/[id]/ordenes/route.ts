import { NextResponse } from "next/server";
import { z } from "zod";

import { getTenantSession, requireOrderStaff } from "@/lib/api-tenant-session";
import { getCustomerOrderHistory } from "@/lib/db/customers";

type Ctx = { params: Promise<{ tenantId: string; id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, id } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = requireOrderStaff(gate.session.user.role);
  if (denied) {
    return denied;
  }
  if (!z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).safeParse(id).success) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const pageRaw = parseInt(searchParams.get("page") ?? "1", 10);
    const limitRaw = parseInt(searchParams.get("limit") ?? "10", 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 10;
    const { data, total } = await getCustomerOrderHistory(
      gate.tenantUuid,
      id,
      page,
      limit,
    );
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return NextResponse.json({ data, total, page, totalPages });
  } catch (e) {
    console.error("[GET clientes/[id]/ordenes]", e);
    return NextResponse.json(
      { error: "Error al listar órdenes del cliente" },
      { status: 500 },
    );
  }
}
