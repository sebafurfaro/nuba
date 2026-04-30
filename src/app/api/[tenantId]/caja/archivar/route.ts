import { NextResponse } from "next/server";
import { z } from "zod";

import { getTenantSession, requireAdminOrSupervisor } from "@/lib/api-tenant-session";
import { archivarOrdenes } from "@/lib/db/caja";

type Ctx = { params: Promise<{ tenantId: string }> };

const bodySchema = z.object({
  branchId: z.string().min(1),
  ordenIds: z.array(z.string().min(1)).min(1),
  notas: z.string().optional(),
});

export async function POST(request: Request, ctx: Ctx) {
  const { tenantId: tenantSlug } = await ctx.params;
  const gate = await getTenantSession(tenantSlug);
  if (gate instanceof NextResponse) return gate;
  const denied = requireAdminOrSupervisor(gate.session.user.role);
  if (denied) return denied;

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const userId = gate.session.user.id;
  if (!userId) {
    return NextResponse.json({ error: "Usuario no identificado" }, { status: 401 });
  }

  try {
    const cashRegister = await archivarOrdenes(
      gate.tenantUuid,
      parsed.data.branchId,
      userId,
      parsed.data.ordenIds,
      parsed.data.notas,
    );
    return NextResponse.json({ cashRegister }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al archivar órdenes";
    if (msg.includes("válidas")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    console.error("[POST caja/archivar]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
