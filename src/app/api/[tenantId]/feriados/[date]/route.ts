import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getTenantSession,
  requireAdmin,
} from "@/lib/api-tenant-session";
import {
  blockDateManually,
  relockDate,
  unlockDate,
} from "@/lib/db/blocked-dates";

type Ctx = { params: Promise<{ tenantId: string; date: string }> };

const bodySchema = z.object({
  action: z.enum(["unlock", "relock", "block_manual"]),
  reason: z.string().max(255).optional(),
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug, date } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdmin(gate.session.user.role);
  if (denied) return denied;

  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { action, reason } = parsed.data;

  try {
    if (action === "unlock") {
      const result = await unlockDate(gate.tenantUuid, date);
      return NextResponse.json(result);
    }

    if (action === "relock") {
      await relockDate(gate.tenantUuid, date);
      return NextResponse.json({ message: "Día bloqueado nuevamente" });
    }

    // block_manual
    const result = await blockDateManually(gate.tenantUuid, date, reason);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[PATCH feriados/[date]]", e);
    return NextResponse.json(
      { error: "Error al actualizar el día" },
      { status: 500 },
    );
  }
}
