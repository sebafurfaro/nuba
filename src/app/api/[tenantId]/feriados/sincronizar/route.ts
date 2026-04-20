import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
} from "@/lib/api-tenant-session";
import { syncHolidaysForTenant } from "@/lib/holidays";

type Ctx = { params: Promise<{ tenantId: string }> };

const bodySchema = z.object({
  year: z.number().int().min(2020).max(2100).optional(),
});

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const year = parsed.data.year ?? new Date().getFullYear();

  try {
    const result = await syncHolidaysForTenant(gate.tenantUuid, year);
    return NextResponse.json({ ...result, year });
  } catch (e) {
    console.error("[POST feriados/sincronizar]", e);
    return NextResponse.json(
      { error: "Error al sincronizar los feriados" },
      { status: 500 },
    );
  }
}
